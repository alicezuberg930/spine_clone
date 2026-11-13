# Character Layer Separator — Web UI

This Vite + React frontend sends character artwork to the See-through FastAPI
server and downloads the generated PSD and image assets as a ZIP archive.

## Run locally

1. Start the API from `see-through-server`:

   ```powershell
   cd D:\Projects\image_layer_separator\see-through-server
   .\.venv\Scripts\python.exe -m api
   ```

2. Start the frontend in a second terminal:

   ```powershell
   cd D:\Projects\image_layer_separator\web-ui
   npm.cmd install
   npm.cmd run dev
   ```

3. Open the local URL printed by Vite, choose a PNG, JPG, or WebP character,
   and click **Separate into layers**. The UI displays the active model stage
   and inference-step progress, then downloads `see-through-layers.zip`.

Vite proxies `/api` requests to `http://127.0.0.1:8001`. The UI posts to
`/api/v1/characters/decompose` with `file`, `resolution`,
`split_left_right`, and `include_intermediates`. Advanced inference values
(`seed`, `steps`, and `depth_resolution`) are intentionally omitted so the
server owns their defaults.

The submit request returns a background-job ID. The UI polls
`/api/v1/characters/jobs/{job_id}` once per second and downloads from the
job's `/download` endpoint after it reaches `complete`.
