
import threading

import numpy as np
import torch

from PIL import Image
from diffusers import QwenImageLayeredPipeline
from diffusers.quantizers import PipelineQuantizationConfig


class InferenceService:

    def __init__(self):
        self.pipeline = None
        self.inference_lock = threading.Lock()

        self.device = "cuda"
        self.dtype = torch.float16

    def load_model(self):

        if not torch.cuda.is_available():
            raise RuntimeError("CUDA is not available")

        self.dtype = (
            torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
        )

        print("=" * 50)
        print("GPU:", torch.cuda.get_device_name(0))
        print("CUDA:", torch.version.cuda)
        print(
            "Total VRAM:",
            round(
                torch.cuda.get_device_properties(0).total_memory
                / 1024**3,
                2
            ),
            "GB"
        )
        print("=" * 50)

        # Quantize the largest component: transformer.
        quantization_config = PipelineQuantizationConfig(
            quant_backend="bitsandbytes_4bit",
            quant_kwargs={
                "load_in_4bit": True,
                "bnb_4bit_quant_type": "nf4",
                "bnb_4bit_compute_dtype": self.dtype,
                "bnb_4bit_use_double_quant": True,
            },
            components_to_quantize=[
                "transformer"
            ],
        )

        print("Loading Qwen-Image-Layered...")
        print("Transformer: 4-bit NF4")
        print("Compute:", self.dtype)
        print("Offloading: Model CPU")

        self.pipeline = QwenImageLayeredPipeline.from_pretrained(
            "Qwen/Qwen-Image-Layered",
            torch_dtype=self.dtype,
            quantization_config=quantization_config,
            low_cpu_mem_usage=True,
        )

        # Do NOT call pipeline.to("cuda").
        # Offload hooks manage GPU placement.
        self.pipeline.enable_model_cpu_offload()

        self.pipeline.set_progress_bar_config(disable=None)

        print("Model loaded successfully!")

    def get_gpu_memory(self):

        if not torch.cuda.is_available():
            return {}

        return {
            "allocated_gb": round(
                torch.cuda.memory_allocated(0) / 1024**3,
                2
            ),
            "reserved_gb": round(
                torch.cuda.memory_reserved(0) / 1024**3,
                2
            ),
            "peak_gb": round(
                torch.cuda.max_memory_allocated(0) / 1024**3,
                2
            ),
        }

    def decompose(
        self,
        image: Image.Image,
        layers: int = 4,
        seed: int = 777,
        steps: int = 50,
        resolution: int = 640,
    ):

        if self.pipeline is None:
            raise RuntimeError("Model is not loaded")

        image = image.convert("RGBA")

        generator = torch.Generator(device="cuda").manual_seed(seed)

        with self.inference_lock:

            torch.cuda.reset_peak_memory_stats()

            try:
                with torch.inference_mode():

                    output = self.pipeline(
                        image=image,
                        generator=generator,
                        true_cfg_scale=4.0,
                        negative_prompt=" ",
                        num_inference_steps=steps,
                        num_images_per_prompt=1,
                        layers=layers,
                        resolution=resolution,
                        cfg_normalize=True,
                        use_en_prompt=True,
                        output_type="np",
                    )

                layer_arrays = output.images[0]
                if not np.isfinite(layer_arrays).all():
                    raise RuntimeError(
                        "The model produced non-finite layer pixels. Check inference precision and model output."
                    )

                if not np.any(layer_arrays):
                    raise RuntimeError(
                        "The model returned only blank layers. Check inference precision and model output."
                    )

                result = [
                    Image.fromarray(
                        np.rint(np.clip(layer * 255, 0, 255)).astype(np.uint8)
                    )
                    for layer in layer_arrays
                ]

                print("GPU memory:", self.get_gpu_memory())

                return result

            except torch.cuda.OutOfMemoryError:
                print("CUDA out of memory!")

                raise

            finally:
                torch.cuda.empty_cache()


inference_service = InferenceService()
