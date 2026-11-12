import threading
from typing import ClassVar

import numpy as np
import torch
from diffusers import QwenImageLayeredPipeline
from diffusers.quantizers import PipelineQuantizationConfig
from PIL import Image

from server.config import DEVICE_TYPE, parse_device_type


class InferenceService:
    PROFILE_NAMES: ClassVar[dict[int, str]] = {
        24: "4-bit NF4",
        40: "8-bit LLM.int8",
        80: "full BF16",
    }

    def __init__(self, device_type: int | None = None):
        self.pipeline = None
        self.inference_lock = threading.Lock()

        self.device = "cuda"
        self.dtype = torch.float16
        self.device_type = parse_device_type(
            DEVICE_TYPE if device_type is None else device_type
        )

    def _build_quantization_config(self):
        if self.device_type == 24:
            return PipelineQuantizationConfig(
                quant_backend="bitsandbytes_4bit",
                quant_kwargs={
                    "load_in_4bit": True,
                    "bnb_4bit_quant_type": "nf4",
                    "bnb_4bit_compute_dtype": self.dtype,
                    "bnb_4bit_use_double_quant": False,
                    "llm_int8_skip_modules": ["transformer_blocks.0.img_mod"],
                },
                components_to_quantize=[
                    "transformer",
                    "text_encoder",
                ],
            )

        if self.device_type == 40:
            return PipelineQuantizationConfig(
                quant_backend="bitsandbytes_8bit",
                quant_kwargs={
                    "load_in_8bit": True,
                    "llm_int8_threshold": 6.0,
                },
                components_to_quantize=[
                    "transformer",
                    "text_encoder",
                ],
            )

        return None

    def _get_total_vram_gb(self):
        return torch.cuda.get_device_properties(0).total_memory / 1024**3

    def _validate_device_capacity(self, total_vram_gb: float):
        # NVIDIA's marketed VRAM size can report slightly below the rounded
        # capacity, so allow one GiB of tolerance.
        if total_vram_gb + 1 < self.device_type:
            # raise RuntimeError(
            #     f"DEVICE_TYPE={self.device_type} requires an approximately "
            #     f"{self.device_type} GB GPU, but only {total_vram_gb:.2f} GB "
            #     "was detected. Select the profile that matches the server GPU."
            # )
            print(f"Warning: DEVICE_TYPE={self.device_type} requires an approximately ")

    def load_model(self):

        if not torch.cuda.is_available():
            raise RuntimeError("CUDA is not available")

        bf16_supported = torch.cuda.is_bf16_supported()
        if self.device_type == 80 and not bf16_supported:
            raise RuntimeError("DEVICE_TYPE=80 requires a CUDA GPU with BF16 support.")

        self.dtype = torch.bfloat16 if bf16_supported else torch.float16
        total_vram_gb = self._get_total_vram_gb()
        self._validate_device_capacity(total_vram_gb)

        print("=" * 50)
        print("GPU:", torch.cuda.get_device_name(0))
        print("CUDA:", torch.version.cuda)
        print("Total VRAM:", round(total_vram_gb, 2), "GB")
        print("DEVICE_TYPE:", self.device_type)
        print("Profile:", self.PROFILE_NAMES[self.device_type])
        print("=" * 50)

        quantization_config = self._build_quantization_config()

        print("Loading Qwen-Image-Layered...")
        print("Compute:", self.dtype)

        load_kwargs = {
            "torch_dtype": self.dtype,
            "low_cpu_mem_usage": True,
        }
        if quantization_config is not None:
            load_kwargs["quantization_config"] = quantization_config

        self.pipeline = QwenImageLayeredPipeline.from_pretrained(
            "Qwen/Qwen-Image-Layered",
            **load_kwargs,
        )

        # These profiles are sized so their selected weight precision and
        # inference headroom fit on the matching GPU tier.
        self.pipeline.to(self.device)

        self.pipeline.set_progress_bar_config(disable=None)

        print("Model loaded successfully!")

    def get_gpu_memory(self):

        if not torch.cuda.is_available():
            return {}

        return {
            "allocated_gb": round(torch.cuda.memory_allocated(0) / 1024**3, 2),
            "reserved_gb": round(torch.cuda.memory_reserved(0) / 1024**3, 2),
            "peak_gb": round(torch.cuda.max_memory_allocated(0) / 1024**3, 2),
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
