from __future__ import annotations

import json
import sys
import textwrap
from pathlib import Path

import pytest

from api.config import Settings
from api.inference_service import (
    DecomposeOptions,
    InferenceOutOfMemoryError,
    InferenceProgressParser,
    PROGRESS_PREFIX,
    SeeThroughInferenceService,
)


def make_settings(tmp_path: Path, *, backend: str = "nf4") -> Settings:
    script_name = (
        "inference_psd_blockswap.py"
        if backend == "blockswap"
        else "inference_psd_quantized.py"
    )
    script = tmp_path / "inference" / "scripts" / script_name
    script.parent.mkdir(parents=True)
    script.write_text("# test script\n", encoding="utf-8")
    (tmp_path / "assets").mkdir()
    return Settings(
        repo_root=tmp_path,
        python_executable=Path(sys.executable),
        jobs_root=tmp_path / "jobs",
        hf_home=tmp_path / "huggingface",
        backend=backend,
        default_resolution=1024,
        default_depth_resolution=768,
        default_steps=30,
        group_offload=False,
        cpu_offload=False,
        timeout_seconds=60,
        max_upload_bytes=1024 * 1024,
        max_image_pixels=4_000_000,
    )


def write_inference_script(settings: Settings, source: str) -> None:
    settings.inference_script.write_text(
        textwrap.dedent(source), encoding="utf-8"
    )


def test_nf4_command_uses_windows_safe_flags(tmp_path: Path):
    service = SeeThroughInferenceService(make_settings(tmp_path))
    command = service.build_command(
        tmp_path / "character.png",
        tmp_path / "output",
        DecomposeOptions(split_left_right=True),
    )

    assert "--quant_mode" in command
    assert command[command.index("--quant_mode") + 1] == "nf4"
    assert "--no_group_offload" in command
    assert "--no_cpu_offload" in command
    assert "--tblr_split" in command


def test_blockswap_command_omits_quantization_flags(tmp_path: Path):
    service = SeeThroughInferenceService(make_settings(tmp_path, backend="blockswap"))
    command = service.build_command(
        tmp_path / "character.png", tmp_path / "output", DecomposeOptions()
    )

    assert "inference_psd_blockswap.py" in command[1]
    assert "--quant_mode" not in command
    assert "--no_group_offload" not in command


def test_progress_parser_maps_stage_and_tqdm_updates():
    updates = []
    parser = InferenceProgressParser(updates.append)
    parser.feed(
        PROGRESS_PREFIX
        + json.dumps(
            {
                "stage": "body",
                "message": "Generating body layers",
                "current": 0,
                "total": 30,
            }
        )
    )
    parser.feed(" 50%|#####     | 15/30 [00:01<00:01]")

    assert updates[-1].stage == "body"
    assert updates[-1].stage_progress == 50
    assert updates[-1].progress == 25
    assert updates[-1].current == 15


def test_decompose_requires_psd_output(tmp_path: Path):
    service_settings = make_settings(tmp_path)
    write_inference_script(
        service_settings,
        """
        import json
        import pathlib
        import sys

        def value(flag):
            return sys.argv[sys.argv.index(flag) + 1]

        output = pathlib.Path(value("--save_dir"))
        source = pathlib.Path(value("--srcp"))
        print(
            "SEE_THROUGH_PROGRESS "
            + json.dumps({
                "stage": "body",
                "message": "Generating body layers",
                "current": 0,
                "total": 30,
            }),
            flush=True,
        )
        print(" 50%|#####     | 15/30 [00:01<00:01]", file=sys.stderr, flush=True)
        output.mkdir(parents=True, exist_ok=True)
        (output / f"{source.stem}.psd").write_bytes(b"psd")
        """,
    )
    service = SeeThroughInferenceService(service_settings)
    service.start()
    source = tmp_path / "character.png"
    source.write_bytes(b"png")
    output = tmp_path / "output"
    updates = []
    result = service.decompose(
        source, output, DecomposeOptions(), progress_callback=updates.append
    )

    assert result.psd_path.read_bytes() == b"psd"
    assert service.health()["jobs_completed"] == 1
    assert any(update.stage_progress == 50 for update in updates)


def test_cuda_oom_is_classified(tmp_path: Path):
    service_settings = make_settings(tmp_path)
    write_inference_script(
        service_settings,
        """
        import sys
        print("torch.cuda.OutOfMemoryError: CUDA out of memory", file=sys.stderr, flush=True)
        raise SystemExit(1)
        """,
    )
    service = SeeThroughInferenceService(service_settings)
    service.start()
    source = tmp_path / "character.png"
    source.write_bytes(b"png")

    with pytest.raises(InferenceOutOfMemoryError):
        service.decompose(source, tmp_path / "output", DecomposeOptions())

