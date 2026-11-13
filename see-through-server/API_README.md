# See-through API server

This wrapper exposes the upstream See-through V3 character decomposition pipeline through FastAPI. Decomposition runs as a background job with live stage and diffusion-step progress, followed by a separate ZIP download.

## Environment setup (Windows PowerShell)

Run every command from this repository root.

```powershell
python3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1

python -m pip install --upgrade pip setuptools wheel
python -m pip install torch==2.8.0+cu128 torchvision==0.23.0+cu128 torchaudio==2.8.0+cu128 --index-url https://download.pytorch.org/whl/cu128
python -m pip install -r requirements.txt
python -m pip install -r requirements-inference-bnb.txt
python -m pip install -r requirements-api.txt
```

The upstream scripts expect `assets` at the repository root. On Windows, copy the small configuration and sample-asset directory once:

```powershell
Copy-Item -Recurse common\assets assets
```

Copy `.env.example` to `.env` if you need to change defaults. NF4, disabled group offload, and 1024px inference are selected for an 8 GB GPU on native Windows. The approximately 5.7 GB of NF4 Hugging Face model files are downloaded into `workspace/huggingface` during the first request, so that request takes longer and requires network access.

## Run

Use exactly one worker so two GPU jobs cannot run in separate processes:

```powershell
.\.venv\Scripts\python.exe -m uvicorn api.main:app --host 127.0.0.1 --port 8001 --workers 1
```

API documentation is available at <http://127.0.0.1:8001/docs>.

## Endpoints

- `GET /health` reports configuration, dependencies, CUDA, GPU memory, and current job state.
- `GET /ready` returns HTTP 200 when inference prerequisites are available, otherwise 503.
- `POST /api/v1/characters/decompose` accepts a PNG, JPG, or WebP multipart upload and returns HTTP 202 with a job ID.
- `GET /api/v1/characters/jobs/{job_id}` reports status, stage, step counts, and overall progress.
- `GET /api/v1/characters/jobs/{job_id}/download` downloads the ZIP after completion.

Example:

```powershell
$job = curl.exe -s -X POST http://127.0.0.1:8001/api/v1/characters/decompose `
  -F "file=@common/assets/test_image.png" `
  -F "resolution=1024" `
  -F "depth_resolution=768" `
  -F "steps=30" `
  -F "split_left_right=true" `
  -F "include_intermediates=true" | ConvertFrom-Json

do {
  Start-Sleep -Seconds 1
  $status = Invoke-RestMethod "http://127.0.0.1:8001$($job.status_url)"
  Write-Host "$($status.progress)% - $($status.message)"
} while ($status.status -in @("queued", "running"))

if ($status.status -eq "complete") {
  curl.exe "http://127.0.0.1:8001$($status.download_url)" `
    --output see-through-layers.zip
}
```

The ZIP contains:

- `project/character.psd` — semantic RGBA layers in inferred draw order.
- `project/character_depth.psd` — corresponding depth layers.
- `project/character.psd.json` — upstream layer bounds and metadata.
- `intermediates/` — semantic PNGs, depth maps, previews, and timing data when requested.
- `manifest.json` — API options and archive inventory.

Only one decomposition runs at a time. Completed and failed jobs are retained for one hour so the result can be downloaded, then removed during subsequent job/status activity.

## License note

The repository code is Apache-2.0. The downloaded model weights use OpenRAIL-derived terms. If this server is exposed as a hosted service, review the model cards and pass their use restrictions and notices through to users in enforceable terms.

