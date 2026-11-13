from __future__ import annotations

import importlib.util
import json
import os
import queue
import re
import subprocess
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from api.config import Settings, settings


class InferenceServiceError(RuntimeError):
    """Base error for failures translated by the API layer."""


class ServiceBusyError(InferenceServiceError):
    pass


class InferenceTimeoutError(InferenceServiceError):
    pass


class InferenceOutOfMemoryError(InferenceServiceError):
    pass


class InferenceProcessError(InferenceServiceError):
    pass


class MissingOutputError(InferenceServiceError):
    pass


PROGRESS_PREFIX = "SEE_THROUGH_PROGRESS "
TQDM_PROGRESS_PATTERN = re.compile(
    r"(?P<percent>\d{1,3})%.*?(?P<current>\d+)\s*/\s*(?P<total>\d+)"
)
STAGE_RANGES: dict[str, tuple[int, int]] = {
    "loading_layerdiff": (5, 5),
    "body": (10, 40),
    "head": (40, 70),
    "loading_depth": (72, 72),
    "depth": (75, 90),
    "psd": (92, 97),
}
STAGE_LABELS = {
    "loading_layerdiff": "Loading the layer model",
    "body": "Generating body layers",
    "head": "Generating head details",
    "loading_depth": "Loading the depth model",
    "depth": "Estimating layer depth",
    "psd": "Assembling the layered PSD",
}


@dataclass(frozen=True, slots=True)
class DecomposeOptions:
    seed: int = 42
    steps: int = 30
    resolution: int = 1024
    depth_resolution: int = 768
    split_left_right: bool = False


@dataclass(frozen=True, slots=True)
class InferenceResult:
    output_dir: Path
    source_stem: str
    command: tuple[str, ...]
    duration_seconds: float
    stdout: str
    stderr: str

    @property
    def psd_path(self) -> Path:
        return self.output_dir / f"{self.source_stem}.psd"


@dataclass(frozen=True, slots=True)
class InferenceProgress:
    stage: str
    message: str
    progress: int
    stage_progress: int | None = None
    current: int | None = None
    total: int | None = None


ProgressCallback = Callable[[InferenceProgress], None]


class InferenceProgressParser:
    """Turn structured stage events and tqdm records into job progress."""

    def __init__(self, callback: ProgressCallback | None):
        self.callback = callback
        self.active_stage: str | None = None
        self.message = "Starting inference"

    @staticmethod
    def _overall_progress(stage: str, stage_progress: int | None) -> int:
        start, end = STAGE_RANGES.get(stage, (0, 0))
        if stage_progress is None or start == end:
            return start
        return round(start + (end - start) * stage_progress / 100)

    def _emit(
        self,
        stage: str,
        *,
        message: str | None = None,
        current: int | None = None,
        total: int | None = None,
    ) -> None:
        if self.callback is None:
            return

        stage_progress = None
        if current is not None and total:
            stage_progress = max(0, min(100, round(current / total * 100)))

        progress = InferenceProgress(
            stage=stage,
            message=message or STAGE_LABELS.get(stage, self.message),
            progress=self._overall_progress(stage, stage_progress),
            stage_progress=stage_progress,
            current=current,
            total=total,
        )
        try:
            self.callback(progress)
        except Exception:
            # UI progress must never be able to fail the inference process.
            pass

    def feed(self, record: str) -> None:
        record = record.strip()
        if not record:
            return

        marker_index = record.find(PROGRESS_PREFIX)
        if marker_index >= 0:
            payload = record[marker_index + len(PROGRESS_PREFIX) :]
            try:
                event = json.loads(payload)
            except (json.JSONDecodeError, TypeError):
                return

            stage = event.get("stage")
            if not isinstance(stage, str) or stage not in STAGE_RANGES:
                return
            self.active_stage = stage
            message = event.get("message")
            if isinstance(message, str) and message:
                self.message = message
            current = event.get("current")
            total = event.get("total")
            self._emit(
                stage,
                message=self.message,
                current=current if isinstance(current, int) else None,
                total=total if isinstance(total, int) else None,
            )
            return

        if self.active_stage not in {"body", "head", "depth"}:
            return
        match = TQDM_PROGRESS_PATTERN.search(record)
        if match is None:
            return
        current = int(match.group("current"))
        total = int(match.group("total"))
        self._emit(
            self.active_stage,
            message=self.message,
            current=current,
            total=total,
        )


class SeeThroughInferenceService:
    def __init__(self, service_settings: Settings = settings):
        self.settings = service_settings
        self._inference_lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._state = "starting"
        self._last_error: str | None = None
        self._jobs_completed = 0
        self._started_at = time.time()

    def start(self) -> None:
        self.settings.jobs_root.mkdir(parents=True, exist_ok=True)
        self.settings.hf_home.mkdir(parents=True, exist_ok=True)
        with self._state_lock:
            self._state = "idle"
            self._last_error = None

    def shutdown(self) -> None:
        with self._state_lock:
            self._state = "stopped"

    def _missing_dependencies(self) -> list[str]:
        modules = ["torch", "cv2", "diffusers", "psd_tools", "modules", "utils"]
        if self.settings.backend == "nf4":
            modules.append("bitsandbytes")
        return [name for name in modules if importlib.util.find_spec(name) is None]

    def _cuda_status(self) -> dict[str, Any]:
        try:
            import torch
        except Exception as exc:  # pragma: no cover - depends on local ML setup
            return {"available": False, "error": str(exc)}

        if not torch.cuda.is_available():
            return {"available": False}

        properties = torch.cuda.get_device_properties(0)
        return {
            "available": True,
            "device": torch.cuda.get_device_name(0),
            "total_vram_gb": round(properties.total_memory / 1024**3, 2),
            "allocated_gb": round(torch.cuda.memory_allocated(0) / 1024**3, 2),
            "reserved_gb": round(torch.cuda.memory_reserved(0) / 1024**3, 2),
        }

    def health(self) -> dict[str, Any]:
        missing = self._missing_dependencies()
        cuda = self._cuda_status()
        script_exists = self.settings.inference_script.is_file()
        assets_exist = (self.settings.repo_root / "assets").exists()
        python_exists = self.settings.python_executable.is_file()
        ready = not missing and cuda.get("available", False) and all(
            (script_exists, assets_exist, python_exists)
        )

        with self._state_lock:
            state = self._state
            last_error = self._last_error
            jobs_completed = self._jobs_completed

        return {
            "status": "ready" if ready else "not_ready",
            "state": state,
            "backend": self.settings.backend,
            "defaults": {
                "resolution": self.settings.default_resolution,
                "depth_resolution": self.settings.default_depth_resolution,
                "steps": self.settings.default_steps,
                "group_offload": self.settings.group_offload,
                "cpu_offload": self.settings.cpu_offload,
            },
            "busy": self._inference_lock.locked(),
            "ready": ready,
            "missing_dependencies": missing,
            "checks": {
                "python": python_exists,
                "inference_script": script_exists,
                "assets": assets_exist,
            },
            "hf_home": str(self.settings.hf_home),
            "cuda": cuda,
            "jobs_completed": jobs_completed,
            "last_error": last_error,
            "uptime_seconds": round(time.time() - self._started_at, 1),
        }

    def build_command(
        self, input_path: Path, output_dir: Path, options: DecomposeOptions
    ) -> list[str]:
        command = [
            str(self.settings.python_executable),
            str(self.settings.inference_script),
            "--srcp",
            str(input_path),
            "--save_dir",
            str(output_dir),
            "--save_to_psd",
            "--seed",
            str(options.seed),
            "--resolution",
            str(options.resolution),
            "--resolution_depth",
            str(options.depth_resolution),
            "--num_inference_steps",
            str(options.steps),
        ]

        if options.split_left_right:
            command.append("--tblr_split")

        if self.settings.backend != "blockswap":
            quant_mode = "nf4" if self.settings.backend == "nf4" else "none"
            command.extend(["--quant_mode", quant_mode])
            command.append(
                "--group_offload"
                if self.settings.group_offload
                else "--no_group_offload"
            )
            command.append(
                "--cpu_offload" if self.settings.cpu_offload else "--no_cpu_offload"
            )

        return command

    def decompose(
        self,
        input_path: Path,
        output_dir: Path,
        options: DecomposeOptions,
        progress_callback: ProgressCallback | None = None,
    ) -> InferenceResult:
        if not self._inference_lock.acquire(blocking=False):
            raise ServiceBusyError("Another decomposition job is already running.")

        started = time.monotonic()
        with self._state_lock:
            self._state = "running"
            self._last_error = None

        try:
            command = self.build_command(input_path, output_dir, options)
            output_dir.mkdir(parents=True, exist_ok=True)
            environment = os.environ.copy()
            environment["PYTHONUTF8"] = "1"
            environment["PYTHONIOENCODING"] = "utf-8"
            environment["PYTHONUNBUFFERED"] = "1"
            environment.setdefault("TOKENIZERS_PARALLELISM", "false")
            environment.setdefault("HF_HOME", str(self.settings.hf_home))
            creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0

            try:
                process = subprocess.Popen(
                    command,
                    cwd=self.settings.repo_root,
                    env=environment,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    bufsize=1,
                    creationflags=creation_flags,
                )
            except OSError as exc:
                raise InferenceProcessError(f"Could not start See-through: {exc}") from exc

            if process.stdout is None:  # pragma: no cover - guaranteed by PIPE
                process.kill()
                raise InferenceProcessError("Could not capture See-through output.")

            output_characters: list[str] = []
            output_records: queue.Queue[str | None] = queue.Queue()

            def read_process_output() -> None:
                record_characters: list[str] = []
                try:
                    while True:
                        character = process.stdout.read(1)
                        if character == "":
                            break
                        output_characters.append(character)
                        if character in {"\r", "\n"}:
                            record = "".join(record_characters).strip()
                            if record:
                                output_records.put(record)
                            record_characters.clear()
                        else:
                            record_characters.append(character)
                    record = "".join(record_characters).strip()
                    if record:
                        output_records.put(record)
                finally:
                    output_records.put(None)

            reader = threading.Thread(
                target=read_process_output,
                name="see-through-output-reader",
                daemon=True,
            )
            reader.start()
            parser = InferenceProgressParser(progress_callback)
            deadline = time.monotonic() + self.settings.timeout_seconds
            reader_finished = False

            while not reader_finished or process.poll() is None:
                if time.monotonic() >= deadline and process.poll() is None:
                    process.kill()
                    process.wait()
                    reader.join(timeout=2)
                    raise InferenceTimeoutError(
                        "See-through exceeded the "
                        f"{self.settings.timeout_seconds}-second timeout."
                    )
                try:
                    record = output_records.get(timeout=0.2)
                except queue.Empty:
                    continue
                if record is None:
                    reader_finished = True
                else:
                    parser.feed(record)

            return_code = process.wait()
            reader.join(timeout=2)
            combined_output = "".join(output_characters)
            if process.returncode != 0:
                if any(
                    marker in combined_output.lower()
                    for marker in (
                        "cuda out of memory",
                        "outofmemoryerror",
                        "not enough memory",
                    )
                ):
                    raise InferenceOutOfMemoryError(
                        "See-through ran out of GPU memory. Try resolution 768 or 1024."
                    )
                detail = (combined_output or "unknown upstream error")[-8000:]
                raise InferenceProcessError(
                    f"See-through exited with code {return_code}: {detail}"
                )

            source_stem = input_path.stem
            expected_psd = output_dir / f"{source_stem}.psd"
            if not expected_psd.is_file() or expected_psd.stat().st_size == 0:
                raise MissingOutputError(
                    f"See-through completed without producing {expected_psd.name}."
                )

            duration = time.monotonic() - started
            with self._state_lock:
                self._state = "idle"
                self._last_error = None
                self._jobs_completed += 1

            return InferenceResult(
                output_dir=output_dir,
                source_stem=source_stem,
                command=tuple(command),
                duration_seconds=duration,
                stdout=combined_output,
                stderr="",
            )
        except InferenceServiceError as exc:
            with self._state_lock:
                self._state = "error"
                self._last_error = str(exc)
            raise
        finally:
            self._inference_lock.release()


inference_service = SeeThroughInferenceService()

