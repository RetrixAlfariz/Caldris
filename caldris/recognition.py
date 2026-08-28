from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


@dataclass(slots=True)
class RecognitionResult:
    available: bool
    engine: str
    text: str | None
    message: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def ocr_available() -> bool:
    return shutil.which("texteller") is not None


def _extract_formula(stdout: str) -> str | None:
    lines = [line.strip() for line in stdout.splitlines() if line.strip()]
    if not lines:
        return None

    # TexTeller's inference command normally emits the prediction near the end.
    # Keeping this intentionally loose makes the adapter tolerant of CLI logging.
    for line in reversed(lines):
        lower = line.lower()
        if lower.startswith(("loading", "using", "device", "warning", "info")):
            continue
        return line
    return lines[-1]


def recognize_image(image_bytes: bytes, suffix: str = ".png") -> RecognitionResult:
    binary = shutil.which("texteller")
    if binary is None:
        return RecognitionResult(
            available=False,
            engine="texteller-cli",
            text=None,
            message=(
                "TexTeller is not installed. Run 'uv sync --extra ocr' or edit "
                "the recognized expression manually."
            ),
        )

    safe_suffix = suffix if suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"} else ".png"
    fd, temp_name = tempfile.mkstemp(prefix="caldris-ink-", suffix=safe_suffix)
    os.close(fd)
    temp_path = Path(temp_name)

    try:
        temp_path.write_bytes(image_bytes)
        process = subprocess.run(
            [binary, "inference", str(temp_path)],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return RecognitionResult(
            available=True,
            engine="texteller-cli",
            text=None,
            message="TexTeller inference timed out after 120 seconds.",
        )
    finally:
        temp_path.unlink(missing_ok=True)

    if process.returncode != 0:
        detail = (process.stderr or process.stdout).strip()
        return RecognitionResult(
            available=True,
            engine="texteller-cli",
            text=None,
            message=f"TexTeller failed: {detail[-500:]}",
        )

    formula = _extract_formula(process.stdout)
    return RecognitionResult(
        available=True,
        engine="texteller-cli",
        text=formula,
        message="Recognition completed." if formula else "TexTeller returned no formula.",
    )
