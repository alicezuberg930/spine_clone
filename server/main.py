from contextlib import asynccontextmanager

from fastapi import FastAPI

from server.image_router import router as image_router
from server.inference_service import inference_service


@asynccontextmanager
async def lifespan(app: FastAPI):

    # Startup
    inference_service.load_model()

    yield

    # Shutdown
    inference_service.pipeline = None


app = FastAPI(title="Qwen Image Layered API", version="1.0.0", lifespan=lifespan)


@app.get("/health")
def health():
    return inference_service.get_gpu_memory()


app.include_router(image_router)
