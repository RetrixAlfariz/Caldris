# Caldris recognition runtime

Caldris v1 is ONNX-first.

1. **Primary:** Texo / `alephpi/FormulaNet` ONNX in a browser Web Worker.
2. **Fallback:** TexTeller CLI through the backend when explicitly installed.

PaddleOCR and PaddlePaddle are no longer required by the v1 hot path.

## Primary path

```text
pointer/stylus strokes
        ↓
canvas ink crop
        ↓
Web Worker
        ↓
Transformers.js + ONNX Runtime Web
        ↓
alephpi/FormulaNet
        ↓
recognized expression
```

The worker loads the model once and reuses it. The first model load currently comes from Hugging Face; later loads can use browser caching where available.

The v1 worker intentionally rasterizes the current stroke cluster because Texo is an image recognizer. Raw stroke timing/order remain retained by the canvas so a future stroke-native model can replace this adapter.

## Optional backend fallback

```bash
uv sync --extra ocr-texteller --group dev
```

The fallback endpoint is `POST /api/recognize`. It is not called during normal local ONNX inference.

## Live behavior

- Stylus pause debounce: ~320 ms.
- Mouse/touch pause debounce: ~520 ms.
- Only the current ink bounding box is exported, with padding.
- ONNX inference happens off the UI thread.
- Stale predictions are discarded when the user resumes writing.
- Backend upload occurs only if the local recognizer fails and a fallback is installed.

## Current deployment limitation

The Transformers.js library and Texo model are fetched remotely on first load. A production/offline build should vendor pinned runtime assets and model files or provide a local model cache. That deployment concern is deliberately separated from the semantic prototype.
