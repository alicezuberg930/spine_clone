import io
import logging
import zipfile

import torch
from app.services.inference_service import inference_service
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from PIL import Image, UnidentifiedImageError

router = APIRouter(prefix="/api/v1/layers", tags=["Image Layers"])
logger = logging.getLogger(__name__)


@router.post("/decompose")
def decompose_image(
    file: UploadFile = File(...),
    layers: int = Form(4, ge=2, le=10),
    seed: int = Form(777),
    steps: int = Form(50, ge=1, le=50),
    resolution: int = Form(640, ge=64, le=1024),
):

    try:
        image = Image.open(file.file)
        image.load()
        image = image.convert("RGBA")

    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="Invalid image file")

    try:
        layer_images = inference_service.decompose(
            image=image,
            layers=layers,
            seed=seed,
            steps=steps,
            resolution=resolution
        )

        zip_buffer = io.BytesIO()

        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for index, layer_image in enumerate(layer_images, start=1):
                image_buffer = io.BytesIO()

                layer_image.save(image_buffer, format="PNG")

                zip_file.writestr(f"layer_{index:02d}.png", image_buffer.getvalue())

        zip_buffer.seek(0)

        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": 'attachment; filename="image_layers.zip"'},
        )

    except torch.cuda.OutOfMemoryError:
        torch.cuda.empty_cache()

        raise HTTPException(
            status_code=503, detail="GPU out of memory. Try a smaller input image."
        )

    except Exception:
        logger.exception("Image decomposition failed")
        raise HTTPException(status_code=500, detail="Image decomposition failed.")
