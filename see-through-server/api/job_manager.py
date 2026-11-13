from __future__ import annotations

import logging
import shutil
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from api.archive import build_result_archive
from api.inference_service import (
    DecomposeOptions,
    InferenceOutOfMemoryError,
    InferenceProgress,
    InferenceServiceError,
    InferenceTimeoutError,
    SeeThroughInferenceService,
    ServiceBusyError,
    inference_service,
)


logger = logging.getLogger(__name__)
ACTIVE_STATUSES = {"queued", "running"}
TERMINAL_STATUSES = {"complete", "failed"}
DEFAULT_RETENTION_SECONDS = 60 * 60


def _iso_timestamp(value: float | None) -> str | None:
    if value is None:
        return None
    return datetime.fromtimestamp(value, timezone.utc).isoformat()


@dataclass(slots=True)
class DecompositionJob:
    job_id: str
    job_root: Path
    source_filename: str
    source_width: int
    source_height: int
    options: DecomposeOptions
    include_intermediates: bool
    status: str = "queued"
    stage: str = "queued"
    message: str = "Waiting to start"
    progress: int = 0
    stage_progress: int | None = None
    current: int | None = None
    total: int | None = None
    error: str | None = None
    created_at: float = field(default_factory=time.time)
    started_at: float | None = None
    completed_at: float | None = None
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    @property
    def input_path(self) -> Path:
        return self.job_root / "character.png"

    @property
    def output_dir(self) -> Path:
        return self.job_root / "output"

    @property
    def archive_path(self) -> Path:
        return self.job_root / "see-through-layers.zip"

    def set_running(self) -> None:
        with self._lock:
            self.status = "running"
            self.stage = "loading_layerdiff"
            self.message = "Starting the layer pipeline"
            self.progress = 3
            self.started_at = time.time()

    def update_progress(self, progress: InferenceProgress) -> None:
        with self._lock:
            self.status = "running"
            self.stage = progress.stage
            self.message = progress.message
            self.progress = progress.progress
            self.stage_progress = progress.stage_progress
            self.current = progress.current
            self.total = progress.total

    def set_packaging(self) -> None:
        with self._lock:
            self.status = "running"
            self.stage = "packaging"
            self.message = "Packaging the download"
            self.progress = 98
            self.stage_progress = None
            self.current = None
            self.total = None

    def set_complete(self) -> None:
        with self._lock:
            self.status = "complete"
            self.stage = "complete"
            self.message = "Your character layers are ready"
            self.progress = 100
            self.stage_progress = 100
            self.current = None
            self.total = None
            self.completed_at = time.time()

    def set_failed(self, message: str) -> None:
        with self._lock:
            self.status = "failed"
            self.stage = "failed"
            self.message = message
            self.error = message
            self.stage_progress = None
            self.current = None
            self.total = None
            self.completed_at = time.time()

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            now = self.completed_at or time.time()
            start = self.started_at or self.created_at
            return {
                "job_id": self.job_id,
                "status": self.status,
                "stage": self.stage,
                "message": self.message,
                "progress": self.progress,
                "stage_progress": self.stage_progress,
                "current": self.current,
                "total": self.total,
                "error": self.error,
                "created_at": _iso_timestamp(self.created_at),
                "started_at": _iso_timestamp(self.started_at),
                "completed_at": _iso_timestamp(self.completed_at),
                "elapsed_seconds": round(max(0.0, now - start), 1),
                "download_ready": self.status == "complete"
                and self.archive_path.is_file(),
            }


class DecompositionJobManager:
    def __init__(
        self,
        service: SeeThroughInferenceService,
        *,
        retention_seconds: int = DEFAULT_RETENTION_SECONDS,
    ):
        self.service = service
        self.retention_seconds = retention_seconds
        self._jobs: dict[str, DecompositionJob] = {}
        self._lock = threading.Lock()

    def _delete_job_files(self, job: DecompositionJob) -> None:
        jobs_root = self.service.settings.jobs_root.resolve()
        job_root = job.job_root.resolve()
        if job_root.parent != jobs_root or job_root.name != job.job_id:
            logger.warning("Refusing to remove unexpected job path: %s", job_root)
            return
        shutil.rmtree(job_root, ignore_errors=True)

    def _cleanup_expired_locked(self) -> None:
        cutoff = time.time() - self.retention_seconds
        expired_ids = [
            job_id
            for job_id, job in self._jobs.items()
            if job.status in TERMINAL_STATUSES
            and job.completed_at is not None
            and job.completed_at < cutoff
        ]
        for job_id in expired_ids:
            job = self._jobs.pop(job_id)
            self._delete_job_files(job)

    def is_busy(self) -> bool:
        with self._lock:
            self._cleanup_expired_locked()
            return any(job.status in ACTIVE_STATUSES for job in self._jobs.values())

    def submit(
        self,
        *,
        job_id: str,
        job_root: Path,
        source_filename: str,
        source_width: int,
        source_height: int,
        options: DecomposeOptions,
        include_intermediates: bool,
    ) -> DecompositionJob:
        job = DecompositionJob(
            job_id=job_id,
            job_root=job_root,
            source_filename=source_filename,
            source_width=source_width,
            source_height=source_height,
            options=options,
            include_intermediates=include_intermediates,
        )

        with self._lock:
            self._cleanup_expired_locked()
            if any(existing.status in ACTIVE_STATUSES for existing in self._jobs.values()):
                raise ServiceBusyError("Another decomposition job is already running.")
            self._jobs[job_id] = job

        worker = threading.Thread(
            target=self._run_job,
            args=(job,),
            name=f"see-through-job-{job_id[:8]}",
            daemon=True,
        )
        try:
            worker.start()
        except Exception:
            with self._lock:
                self._jobs.pop(job_id, None)
            raise
        return job

    def get(self, job_id: str) -> DecompositionJob | None:
        with self._lock:
            self._cleanup_expired_locked()
            return self._jobs.get(job_id)

    @staticmethod
    def _public_error(error: Exception) -> str:
        if isinstance(error, (InferenceOutOfMemoryError, InferenceTimeoutError)):
            return str(error)
        if isinstance(error, ServiceBusyError):
            return "The GPU is already processing another character."
        return "Character decomposition failed."

    def _run_job(self, job: DecompositionJob) -> None:
        job.set_running()
        try:
            result = self.service.decompose(
                job.input_path,
                job.output_dir,
                job.options,
                progress_callback=job.update_progress,
            )
            job.set_packaging()
            archive = build_result_archive(
                result,
                source_filename=job.source_filename,
                backend=self.service.settings.backend,
                options={
                    "seed": job.options.seed,
                    "steps": job.options.steps,
                    "resolution": job.options.resolution,
                    "depth_resolution": job.options.depth_resolution,
                    "split_left_right": job.options.split_left_right,
                    "include_intermediates": job.include_intermediates,
                    "source_width": job.source_width,
                    "source_height": job.source_height,
                },
                include_intermediates=job.include_intermediates,
            )
            job.archive_path.write_bytes(archive.getbuffer())
            job.set_complete()
        except InferenceServiceError as error:
            logger.exception("See-through job %s failed", job.job_id)
            job.set_failed(self._public_error(error))
        except Exception:
            logger.exception("Unexpected failure in See-through job %s", job.job_id)
            job.set_failed("Character decomposition failed.")


job_manager = DecompositionJobManager(inference_service)
