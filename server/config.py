import os
from pathlib import Path

from dotenv import load_dotenv

SUPPORTED_DEVICE_TYPES = (24, 40, 80)
ENV_FILE = Path(__file__).resolve().with_name(".env")

load_dotenv(ENV_FILE, override=False)


def parse_device_type(value: str | int | None) -> int:
    if value is None:
        return 24

    try:
        device_type = int(str(value).strip())
    except ValueError as exc:
        raise ValueError("DEVICE_TYPE must be one of 24, 40, or 80.") from exc

    if device_type not in SUPPORTED_DEVICE_TYPES:
        raise ValueError(f"DEVICE_TYPE must be one of 24, 40, or 80; got {value!r}.")

    return device_type


DEVICE_TYPE = parse_device_type(os.getenv("DEVICE_TYPE"))
