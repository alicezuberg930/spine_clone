from __future__ import annotations

import shutil
import uuid
import warnings
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError

from api.config import settings as api_settings
from api.inference_service import (
    DecomposeOptions,
    ServiceBusyError,
)
from api.job_manager import (
    DecompositionJob,
    DecompositionJobManager,
    job_manager,
)

router = APIRouter(prefix="/api/v1/characters", tags=["Character Layers"])
SUPPORTED_FORMATS = {"JPEG", "PNG", "WEBP"}
READ_CHUNK_SIZE = 1024 * 1024


def get_job_manager() -> DecompositionJobManager:
    return job_manager


def _job_payload(job: DecompositionJob) -> dict:
    payload = job.snapshot()
    status_url = f"/api/v1/characters/jobs/{job.job_id}"
    payload["status_url"] = status_url
    payload["download_url"] = (
        f"{status_url}/download" if payload["download_ready"] else None
    )
    payload["retry_after_ms"] = 1000
    return payload


def _save_upload(upload: UploadFile, destination: Path, max_bytes: int) -> int:
    total = 0
    with destination.open("wb") as output:
        while chunk := upload.file.read(READ_CHUNK_SIZE):
            total += len(chunk)
            if total > max_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"Image exceeds the {max_bytes // (1024 * 1024)} MB upload limit.",
                )
            output.write(chunk)
    if total == 0:
        raise HTTPException(status_code=400, detail="The uploaded image is empty.")
    return total


def _normalize_image(
    source: Path, destination: Path, max_pixels: int
) -> tuple[int, int]:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(source) as image:
                if image.format not in SUPPORTED_FORMATS:
                    raise HTTPException(
                        status_code=400,
                        detail="Supported image formats are PNG, JPG, and WebP.",
                    )
                if getattr(image, "n_frames", 1) != 1:
                    raise HTTPException(
                        status_code=400, detail="Animated images are not supported."
                    )
                width, height = image.size
                if width <= 0 or height <= 0 or width * height > max_pixels:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Image exceeds the {max_pixels:,}-pixel decode limit.",
                    )
                image.load()
                image.convert("RGBA").save(destination, format="PNG")
                return width, height
    except HTTPException:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(status_code=413, detail="Image dimensions are too large.")
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise HTTPException(
            status_code=400, detail="Invalid or unreadable image file."
        ) from exc


@router.post("/decompose", status_code=202)
def decompose_character(
    file: Annotated[UploadFile, File(description="PNG, JPG, or WebP character image")],
    manager: Annotated[DecompositionJobManager, Depends(get_job_manager)],
    seed: Annotated[int, Form(ge=0, le=4_294_967_295)] = 42,
    steps: Annotated[int, Form(ge=1, le=50)] = api_settings.default_steps,
    resolution: Annotated[int, Form(ge=512, le=1536)] = api_settings.default_resolution,
    depth_resolution: Annotated[int, Form(ge=256, le=1536)] = (
        api_settings.default_depth_resolution
    ),
    split_left_right: Annotated[bool, Form()] = False,
    include_intermediates: Annotated[bool, Form()] = True,
):
    if resolution % 64 != 0:
        raise HTTPException(
            status_code=422, detail="resolution must be divisible by 64."
        )
    if depth_resolution % 8 != 0:
        raise HTTPException(
            status_code=422, detail="depth_resolution must be divisible by 8."
        )

    if manager.is_busy():
        raise HTTPException(
            status_code=503,
            detail="Another decomposition job is already running.",
            headers={"Retry-After": "30"},
        )

    manager.service.settings.jobs_root.mkdir(parents=True, exist_ok=True)
    source_filename = file.filename or "character.png"
    options = DecomposeOptions(
        seed=seed,
        steps=steps,
        resolution=resolution,
        depth_resolution=depth_resolution,
        split_left_right=split_left_right,
    )

    job_id = uuid.uuid4().hex
    job_root = manager.service.settings.jobs_root / job_id
    submitted = False
    try:
        job_root.mkdir(parents=False, exist_ok=False)
        raw_upload = job_root / "upload.bin"
        normalized_input = job_root / "character.png"
        _save_upload(file, raw_upload, manager.service.settings.max_upload_bytes)
        width, height = _normalize_image(
            raw_upload,
            normalized_input,
            manager.service.settings.max_image_pixels,
        )
        job = manager.submit(
            job_id=job_id,
            job_root=job_root,
            source_filename=source_filename,
            source_width=width,
            source_height=height,
            options=options,
            include_intermediates=include_intermediates,
        )
        submitted = True
        return _job_payload(job)
    except ServiceBusyError as exc:
        raise HTTPException(
            status_code=503, detail=str(exc), headers={"Retry-After": "30"}
        ) from exc
    finally:
        file.file.close()
        if not submitted and job_root.exists():
            shutil.rmtree(job_root, ignore_errors=True)


@router.get("/jobs/{job_id}")
def get_decomposition_job(
    job_id: str,
    manager: Annotated[DecompositionJobManager, Depends(get_job_manager)],
):
    job = manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Decomposition job not found.")
    return _job_payload(job)


@router.get("/jobs/{job_id}/download")
def download_decomposition_job(
    job_id: str,
    manager: Annotated[DecompositionJobManager, Depends(get_job_manager)],
):
    job = manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Decomposition job not found.")
    snapshot = job.snapshot()
    if snapshot["status"] == "failed":
        raise HTTPException(
            status_code=409,
            detail=snapshot["error"] or "Character decomposition failed.",
        )
    if snapshot["status"] != "complete" or not job.archive_path.is_file():
        raise HTTPException(status_code=409, detail="Decomposition job is not complete.")

    return FileResponse(
        job.archive_path,
        media_type="application/zip",
        filename="see-through-layers.zip",
        headers={
            "Cache-Control": "no-store",
            "X-See-Through-Backend": manager.service.settings.backend,
        },
    )
