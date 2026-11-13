from __future__ import annotations

import io
import json
import zipfile
from typing import Any

from api.inference_service import InferenceResult


PREVIEW_FILES = {"reconstruction.png", "stats.json", "info.json"}


def build_result_archive(
    result: InferenceResult,
    *,
    source_filename: str,
    backend: str,
    options: dict[str, Any],
    include_intermediates: bool,
) -> io.BytesIO:
    archive_buffer = io.BytesIO()
    archived_files: list[str] = []

    with zipfile.ZipFile(archive_buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        top_level_candidates = (
            result.output_dir / f"{result.source_stem}.psd",
            result.output_dir / f"{result.source_stem}_depth.psd",
            result.output_dir / f"{result.source_stem}.psd.json",
        )
        for path in top_level_candidates:
            if not path.is_file():
                continue
            archive_name = f"project/{path.name}"
            archive.write(path, archive_name)
            archived_files.append(archive_name)

        intermediate_root = result.output_dir / result.source_stem
        if intermediate_root.is_dir():
            for path in sorted(intermediate_root.rglob("*")):
                if not path.is_file():
                    continue
                relative = path.relative_to(intermediate_root).as_posix()
                if not include_intermediates and path.name not in PREVIEW_FILES:
                    continue
                prefix = "intermediates" if include_intermediates else "preview"
                archive_name = f"{prefix}/{relative}"
                archive.write(path, archive_name)
                archived_files.append(archive_name)

        manifest = {
            "format": "see-through-layer-decomposition",
            "version": 1,
            "source_filename": source_filename,
            "backend": backend,
            "duration_seconds": round(result.duration_seconds, 3),
            "options": options,
            "artifacts": archived_files,
        }
        archive.writestr(
            "manifest.json",
            json.dumps(manifest, indent=2, ensure_ascii=False).encode("utf-8"),
        )

    archive_buffer.seek(0)
    return archive_buffer

