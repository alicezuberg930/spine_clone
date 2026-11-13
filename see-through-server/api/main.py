from contextlib import asynccontextmanager

from fastapi import FastAPI, Response

from api.inference_service import inference_service
from api.router import router as character_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    inference_service.start()
    yield
    inference_service.shutdown()


app = FastAPI(
    title="See-through Character Layer API",
    version="1.1.0",
    description="Decompose anime character images into semantic, ordered PSD layers.",
    lifespan=lifespan,
)


@app.get("/health")
def health():
    return inference_service.health()


@app.get("/ready")
def ready(response: Response):
    status = inference_service.health()
    if not status["ready"]:
        response.status_code = 503
    return status


app.include_router(character_router)

