from __future__ import annotations

import importlib.util
import io
import os
import shutil
import subprocess
import tempfile
import threading
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

MODEL_NAME = os.getenv("CALDRIS_OCR_MODEL", "PP-FormulaNet_plus-S")
DEVICE = os.getenv("CALDRIS_OCR_DEVICE", "").strip() or None

_MODEL: Any | None = None
_MODEL_LOAD_ERROR: str | None = None
_MODEL_LOCK = threading.Lock()
_PREDICT_LOCK = threading.Lock()


@dataclass(slots=True)
class RecognitionResult:
    available: bool
    engine: str
    text: str | None
    message: str
    latency_ms: float | None = None
    resident: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _paddleocr_installed() -> bool:
    return importlib.util.find_spec("paddleocr") is not None


def _texteller_available() -> bool:
    return shutil.which("texteller") is not None


def ocr_available() -> bool:
    return _paddleocr_installed() or _texteller_available()


def ocr_status() -> dict[str, Any]:
    primary_installed = _paddleocr_installed()
    fallback_installed = _texteller_available()
    return {
        "available": primary_installed or fallback_installed,
        "engine": MODEL_NAME if primary_installed else ("texteller-cli" if fallback_installed else None),
        "primary": MODEL_NAME,
        "primary_installed": primary_installed,
        "fallback": "texteller-cli" if fallback_installed else None,
        "resident": _MODEL is not None,
        "device": DEVICE or "auto",
        "load_error": _MODEL_LOAD_ERROR,
    }


def _load_model() -> Any:
    global _MODEL, _MODEL_LOAD_ERROR
    if _MODEL is not None:
        return _MODEL

    with _MODEL_LOCK:
        if _MODEL is not None:
            return _MODEL

        try:
            from paddleocr import FormulaRecognition

            kwargs: dict[str, Any] = {
                "model_name": MODEL_NAME,
                "engine": "paddle_static",
            }
            if DEVICE is not None:
                kwargs["device"] = DEVICE

            _MODEL = FormulaRecognition(**kwargs)
            _MODEL_LOAD_ERROR = None
            return _MODEL
        except Exception as exc:
            _MODEL_LOAD_ERROR = f"{type(exc).__name__}: {exc}"
            raise


def warmup_ocr() -> dict[str, Any]:
    if not _paddleocr_installed():
        return ocr_status()

    started = time.perf_counter()
    try:
        _load_model()
    except Exception:
        # The status carries the initialization error and TexTeller may still be usable.
        pass

    status = ocr_status()
    status["warmup_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return status


def _find_rec_formula(value: Any) -> str | None:
    if isinstance(value, dict):
        direct = value.get("rec_formula")
        if isinstance(direct, str) and direct.strip():
            return direct.strip()
        for nested in value.values():
            found = _find_rec_formula(nested)
            if found:
                return found
    elif isinstance(value, (list, tuple)):
        for nested in value:
            found = _find_rec_formula(nested)
            if found:
                return found
    return None


def _recognize_with_paddle(image_bytes: bytes) -> RecognitionResult:
    started = time.perf_counter()
    model = _load_model()

    import numpy as np
    from PIL import Image

    with Image.open(io.BytesIO(image_bytes)) as image:
        image_array = np.asarray(image.convert("RGB"))

    # The resident model is shared by requests. Serializing prediction avoids
    # concurrent access to inference state while still eliminating model reloads.
    with _PREDICT_LOCK:
        output = model.predict(input=image_array, batch_size=1)
        result = next(iter(output), None)

    formula = None
    if result is not None:
        payload = getattr(result, "json", None)
        if callable(payload):
            payload = payload()
        formula = _find_rec_formula(payload)

    latency = round((time.perf_counter() - started) * 1000, 1)
    return RecognitionResult(
        available=True,
        engine=MODEL_NAME,
        text=formula,
        message="Recognition completed." if formula else "PaddleOCR returned no formula.",
        latency_ms=latency,
        resident=True,
    )


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


def _recognize_with_texteller(image_bytes: bytes, suffix: str) -> RecognitionResult:
    binary = shutil.which("texteller")
    if binary is None:
        return RecognitionResult(
            available=False,
            engine="none",
            text=None,
            message="No OCR backend is installed. Install the 'ocr' extra for PaddleOCR.",
        )

    started = time.perf_counter()
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
    latency = round((time.perf_counter() - started) * 1000, 1)
    return RecognitionResult(
        available=True,
        engine="texteller-cli",
        text=formula,
        message="Recognition completed." if formula else "TexTeller returned no formula.",
        latency_ms=latency,
        resident=False,
    )


def recognize_image(image_bytes: bytes, suffix: str = ".png") -> RecognitionResult:
    if _paddleocr_installed():
        try:
            return _recognize_with_paddle(image_bytes)
        except Exception as exc:
            if not _texteller_available():
                return RecognitionResult(
                    available=True,
                    engine=MODEL_NAME,
                    text=None,
                    message=f"PaddleOCR failed: {type(exc).__name__}: {exc}",
                    resident=_MODEL is not None,
                )

    return _recognize_with_texteller(image_bytes, suffix)
