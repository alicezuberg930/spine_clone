from __future__ import annotations

import io
import json
import sys
import threading
import time
import zipfile
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from api.config import Settings
from api.inference_service import DecomposeOptions, InferenceProgress, InferenceResult
from api.job_manager import DecompositionJobManager
from api.router import get_job_manager, router


class FakeInferenceService:
    def __init__(self, tmp_path: Path):
        self.settings = Settings(
            repo_root=tmp_path,
            python_executable=Path(sys.executable),
            jobs_root=tmp_path / "jobs",
            hf_home=tmp_path / "huggingface",
            backend="nf4",
            default_resolution=1024,
            default_depth_resolution=768,
            default_steps=30,
            group_offload=False,
            cpu_offload=False,
            timeout_seconds=60,
            max_upload_bytes=1024 * 1024,
            max_image_pixels=4_000_000,
        )
        self.last_options: DecomposeOptions | None = None

    def decompose(
        self,
        input_path: Path,
        output_dir: Path,
        options: DecomposeOptions,
        progress_callback=None,
    ) -> InferenceResult:
        self.last_options = options
        if progress_callback is not None:
            progress_callback(
                InferenceProgress(
                    stage="body",
                    message="Generating body layers",
                    progress=25,
                    stage_progress=50,
                    current=15,
                    total=30,
                )
            )
        output_dir.mkdir(parents=True)
        (output_dir / "character.psd").write_bytes(b"layered psd")
        (output_dir / "character_depth.psd").write_bytes(b"depth psd")
        (output_dir / "character.psd.json").write_text(
            json.dumps({"parts": {"face": {}}}), encoding="utf-8"
        )
        intermediate = output_dir / "character"
        intermediate.mkdir()
        Image.new("RGBA", (8, 8), (255, 0, 0, 255)).save(
            intermediate / "reconstruction.png"
        )
        return InferenceResult(
            output_dir=output_dir,
            source_stem="character",
            command=("fake",),
            duration_seconds=1.25,
            stdout="done",
            stderr="",
        )


class BlockingInferenceService(FakeInferenceService):
    def __init__(self, tmp_path: Path):
        super().__init__(tmp_path)
        self.started = threading.Event()
        self.release = threading.Event()

    def decompose(
        self,
        input_path: Path,
        output_dir: Path,
        options: DecomposeOptions,
        progress_callback=None,
    ) -> InferenceResult:
        if progress_callback is not None:
            progress_callback(
                InferenceProgress(
                    stage="body",
                    message="Generating body layers",
                    progress=25,
                    stage_progress=50,
                    current=15,
                    total=30,
                )
            )
        self.started.set()
        if not self.release.wait(timeout=2):
            raise RuntimeError("Test job was not released.")
        return super().decompose(
            input_path,
            output_dir,
            options,
            progress_callback=progress_callback,
        )


def image_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGBA", (16, 12), (10, 20, 30, 255)).save(buffer, format="PNG")
    return buffer.getvalue()


def make_client(
    tmp_path: Path,
) -> tuple[TestClient, FakeInferenceService, DecompositionJobManager]:
    fake_service = FakeInferenceService(tmp_path)
    manager = DecompositionJobManager(fake_service)
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_job_manager] = lambda: manager
    return TestClient(app), fake_service, manager


def wait_for_terminal_job(client: TestClient, status_url: str) -> dict:
    for _ in range(100):
        response = client.get(status_url)
        assert response.status_code == 200
        payload = response.json()
        if payload["status"] in {"complete", "failed"}:
            return payload
        time.sleep(0.01)
    raise AssertionError("Job did not reach a terminal state.")


def test_decompose_returns_layer_archive(tmp_path: Path):
    client, service, _ = make_client(tmp_path)
    response = client.post(
        "/api/v1/characters/decompose",
        files={"file": ("hero.png", image_bytes(), "image/png")},
        data={
            "resolution": "1024",
            "depth_resolution": "768",
            "steps": "25",
            "split_left_right": "true",
            "include_intermediates": "false",
        },
    )

    assert response.status_code == 202
    submitted = response.json()
    assert submitted["status"] in {"queued", "running", "complete"}
    assert submitted["status_url"].startswith("/api/v1/characters/jobs/")

    completed = wait_for_terminal_job(client, submitted["status_url"])
    assert completed["status"] == "complete"
    assert completed["progress"] == 100
    assert completed["download_ready"] is True
    assert service.last_options == DecomposeOptions(
        seed=42,
        steps=25,
        resolution=1024,
        depth_resolution=768,
        split_left_right=True,
    )

    download = client.get(completed["download_url"])
    assert download.status_code == 200
    assert download.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(download.content)) as archive:
        names = set(archive.namelist())
        assert "project/character.psd" in names
        assert "project/character_depth.psd" in names
        assert "project/character.psd.json" in names
        assert "preview/reconstruction.png" in names
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["source_filename"] == "hero.png"
        assert manifest["options"]["source_width"] == 16
        assert manifest["options"]["source_height"] == 12


def test_rejects_invalid_image(tmp_path: Path):
    client, _, _ = make_client(tmp_path)
    response = client.post(
        "/api/v1/characters/decompose",
        files={"file": ("not-image.png", b"not an image", "image/png")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid or unreadable image file."


def test_requires_aligned_resolution(tmp_path: Path):
    client, _, _ = make_client(tmp_path)
    response = client.post(
        "/api/v1/characters/decompose",
        files={"file": ("hero.png", image_bytes(), "image/png")},
        data={"resolution": "1000"},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "resolution must be divisible by 64."


def test_running_job_exposes_progress_and_blocks_download(tmp_path: Path):
    service = BlockingInferenceService(tmp_path)
    manager = DecompositionJobManager(service)
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_job_manager] = lambda: manager
    client = TestClient(app)

    submitted = client.post(
        "/api/v1/characters/decompose",
        files={"file": ("hero.png", image_bytes(), "image/png")},
    ).json()
    assert service.started.wait(timeout=1)

    running = client.get(submitted["status_url"])
    assert running.status_code == 200
    assert running.json()["status"] == "running"
    assert running.json()["stage"] == "body"
    assert running.json()["current"] == 15

    early_download = client.get(
        f"{submitted['status_url']}/download"
    )
    assert early_download.status_code == 409

    service.release.set()
    completed = wait_for_terminal_job(client, submitted["status_url"])
    assert completed["status"] == "complete"

