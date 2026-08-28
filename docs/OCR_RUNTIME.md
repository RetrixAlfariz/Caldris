# Caldris OCR runtime

Caldris v1 uses a two-tier formula recognizer.

1. **Primary:** `PP-FormulaNet_plus-S` through PaddleOCR's in-process `FormulaRecognition` API.
2. **Fallback:** TexTeller CLI when PaddleOCR is unavailable or initialization fails.

The primary model is lazy-loaded once and kept resident for subsequent requests. Live capture crops to the current ink bounding box before upload, so empty canvas space is not repeatedly sent through the recognizer.

## Install

```bash
uv sync --extra ocr --group dev
```

PaddleOCR requires PaddlePaddle. Install the PaddlePaddle build appropriate for the machine (CPU or GPU) according to the official Paddle installation instructions. Caldris intentionally does not pin a CPU PaddlePaddle wheel because that would replace or conflict with GPU installations.

Optional TexTeller fallback:

```bash
uv sync --extra ocr-texteller --group dev
```

## Runtime knobs

```text
CALDRIS_OCR_MODEL=PP-FormulaNet_plus-S
CALDRIS_OCR_DEVICE=gpu:0
```

Leave `CALDRIS_OCR_DEVICE` unset to let PaddleOCR choose the available device.

## Live-capture behavior

- Stylus pause debounce: ~420 ms.
- Mouse/touch pause debounce: ~650 ms.
- Only the bounding box containing ink is exported, with padding.
- Stale inference results are discarded if the user starts writing again.
- In-flight model prediction is serialized because a single resident model instance is shared.
- The frontend warms the resident model after page load when PaddleOCR is available.
