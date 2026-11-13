from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # The health endpoint can still explain incomplete setup.
    load_dotenv = None


REPO_ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = REPO_ROOT / ".env"
SUPPORTED_BACKENDS = ("nf4", "bf16", "blockswap")

if load_dotenv is not None:
    load_dotenv(ENV_FILE, override=False)


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be true or false; got {raw!r}.")


def _env_int(name: str, default: int, *, minimum: int = 1) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer; got {raw!r}.") from exc
    if value < minimum:
        raise ValueError(f"{name} must be at least {minimum}; got {value}.")
    return value


def _repo_path_from_env(name: str, default: str) -> Path:
    configured = os.getenv(name, default)
    path = Path(configured)
    if not path.is_absolute():
        path = REPO_ROOT / path
    return path.resolve()


@dataclass(frozen=True, slots=True)
class Settings:
    repo_root: Path
    python_executable: Path
    jobs_root: Path
    hf_home: Path
    backend: str
    default_resolution: int
    default_depth_resolution: int
    default_steps: int
    group_offload: bool
    cpu_offload: bool
    timeout_seconds: int
    max_upload_bytes: int
    max_image_pixels: int

    @classmethod
    def from_env(cls) -> Settings:
        backend = os.getenv("SEE_THROUGH_BACKEND", "nf4").strip().lower()
        if backend not in SUPPORTED_BACKENDS:
            choices = ", ".join(SUPPORTED_BACKENDS)
            raise ValueError(
                f"SEE_THROUGH_BACKEND must be one of {choices}; got {backend!r}."
            )

        return cls(
            repo_root=REPO_ROOT,
            python_executable=Path(sys.executable).resolve(),
            jobs_root=_repo_path_from_env("SEE_THROUGH_JOBS_DIR", "workspace/api_jobs"),
            hf_home=_repo_path_from_env("SEE_THROUGH_HF_HOME", "workspace/huggingface"),
            backend=backend,
            # 1024 is safer than 1280 for an 8 GB card under Windows WDDM.
            default_resolution=_env_int("SEE_THROUGH_RESOLUTION", 1024, minimum=512),
            default_depth_resolution=_env_int(
                "SEE_THROUGH_DEPTH_RESOLUTION", 768, minimum=256
            ),
            default_steps=_env_int("SEE_THROUGH_STEPS", 30),
            # Upstream issue #52 reports NF4 + group offload failures on native Windows.
            group_offload=_env_bool("SEE_THROUGH_GROUP_OFFLOAD", os.name != "nt"),
            cpu_offload=_env_bool("SEE_THROUGH_CPU_OFFLOAD", False),
            timeout_seconds=_env_int("SEE_THROUGH_TIMEOUT_SECONDS", 1800, minimum=60),
            max_upload_bytes=_env_int("SEE_THROUGH_MAX_UPLOAD_MB", 25) * 1024 * 1024,
            max_image_pixels=_env_int(
                "SEE_THROUGH_MAX_IMAGE_PIXELS", 67_108_864, minimum=1_000_000
            ),
        )

    @property
    def inference_script(self) -> Path:
        script_name = (
            "inference_psd_blockswap.py"
            if self.backend == "blockswap"
            else "inference_psd_quantized.py"
        )
        return self.repo_root / "inference" / "scripts" / script_name


settings = Settings.from_env()
