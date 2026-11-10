# Image Layer Separator — Web UI

This is a Vite + React frontend for the FastAPI image decomposition endpoint.

## Run locally

1. Start the API from `server`:

   ```powershell
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

2. In `web-ui`, install dependencies and start Vite:

   ```powershell
   npm install
   npm run dev
   ```

3. Open the local URL printed by Vite, choose an image, and click **Separate into layers**. The API response is downloaded as `image_layers.zip`.

The Vite development server proxies `/api` requests to `http://127.0.0.1:8000`, so the API does not need CORS enabled for local development.
