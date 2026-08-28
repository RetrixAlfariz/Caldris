from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


@dataclass(slots=True)
class RecognitionResult:
    available: bool
    engine: str
    text: str | None
    message: str
    latency_ms: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def fallback_ocr_status() -> dict[str, Any]:
    binary = shutil.which("texteller")
    return {
        "available": binary is not None,
        "engine": "texteller-cli" if binary else None,
    }


def _extract_formula(stdout: str) -> str | None:
    lines = [line.strip() for line in stdout.splitlines() if line.strip()]
    if not lines:
        return None

    for line in reversed(lines):
        lower = line.lower()
        if lower.startswith(("loading", "using", "device", "warning", "info")):
            continue
        return line
    return lines[-1]


def recognize_image(image_bytes: bytes, suffix: str = ".png") -> RecognitionResult:
    """Fallback image recognizer.

    The primary Caldris v1 recognizer runs as ONNX in the browser. This backend
    endpoint intentionally stays small and only exists for an optional
    TexTeller fallback or manual recovery path.
    """

    binary = shutil.which("texteller")
    if binary is None:
        return RecognitionResult(
            available=False,
            engine="none",
            text=None,
            message=(
                "Browser ONNX is the primary recognizer. No backend fallback is "
                "installed; optionally run 'uv sync --extra ocr-texteller'."
            ),
        )

    started = time.perf_counter()
    safe_suffix = suffix if suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"} else ".png"
    fd, temp_name = tempfile.mkstemp(prefix="caldris-fallback-", suffix=safe_suffix)
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
            message="TexTeller fallback timed out after 120 seconds.",
        )
    finally:
        temp_path.unlink(missing_ok=True)

    if process.returncode != 0:
        detail = (process.stderr or process.stdout).strip()
        return RecognitionResult(
            available=True,
            engine="texteller-cli",
            text=None,
            message=f"TexTeller fallback failed: {detail[-500:]}",
        )

    formula = _extract_formula(process.stdout)
    latency = round((time.perf_counter() - started) * 1000, 1)
    return RecognitionResult(
        available=True,
        engine="texteller-cli",
        text=formula,
        message="Fallback recognition completed." if formula else "TexTeller returned no formula.",
        latency_ms=latency,
    )
