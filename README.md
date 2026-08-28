# Caldris

**Caldris** is an open-source-oriented semantic handwritten computation prototype for mathematics and engineering.

The `v1` branch stays deliberately narrow: prove that handwriting can become an editable, solvable, variable-aware computational object before Caldris grows into a full engineering notebook.

## Prototype flow

```text
live ink canvas
    ↓
ink bounding-box crop
    ↓
Texo / FormulaNet ONNX
(browser Web Worker, primary)
    ↓
TexTeller CLI
(optional backend fallback)
    ↓
editable recognized expression
    ↓
SymPy parser / solver
    ↓
simple derivation steps
    ↓
reactive variable workspace
```

## Why ONNX-first

Caldris no longer puts PaddleOCR in the live path. The primary recognizer is `alephpi/FormulaNet` (Texo), a 20M-parameter formula-recognition model with ONNX weights. It runs in a browser worker through Transformers.js, so repeated handwriting recognition does not require a Python ML runtime, PaddlePaddle, image upload to the backend, or model reload per stroke.

The backend remains responsible for deterministic computation. Recognition is an adapter and can be replaced later by a stroke-native `Caldris-HMER` model without redesigning the solver.

## What works in v1

- Pointer/stylus/mouse drawing canvas with undo and clear.
- Automatic live recognition after a short writing pause.
- Ink-region cropping instead of processing the whole canvas.
- Browser-side ONNX inference in a Web Worker.
- Stale recognition results are discarded when new ink is added.
- Optional TexTeller backend fallback.
- Editable recognition result, so OCR mistakes do not block the prototype.
- Single-expression solving with SymPy.
- Human-readable steps for basic linear equations and simple quadratic factorization.
- Variable workspace with dependency resolution.
- Reactive recalculation by editing a variable definition and evaluating again.
- Circular dependency detection.

## Quick start

Requires Python 3.11 or 3.12 and `uv`.

```bash
git clone https://github.com/RetrixAlfariz/Caldris.git
cd Caldris
git checkout v1

uv sync --group dev
uv run uvicorn caldris.main:app --reload
```

Open `http://127.0.0.1:8000`.

On the first recognition session the browser downloads the Texo ONNX model from Hugging Face and caches browser assets where supported. The handwriting crop is then processed locally in the browser worker. A network connection is therefore currently required for the first model load; vendored/offline model packaging is a later deployment task.

### Optional TexTeller fallback

```bash
uv sync --extra ocr-texteller --group dev
```

If local browser ONNX initialization or a prediction fails, Caldris can use the backend `POST /api/recognize` path when TexTeller is installed. If no fallback exists, recognition remains manually editable and the deterministic solver still works.

## Live-capture behavior

```text
pen stroke
    ↓
pause ~320 ms (stylus) / ~520 ms (mouse or touch)
    ↓
crop current ink bounds + padding
    ↓
Texo ONNX in Web Worker
    ↓
LaTeX-like expression
    ↓
Caldris parser
    ↓
solver + steps
```

The model worker is initialized once. New strokes invalidate older in-flight predictions so stale formulas cannot overwrite newer handwriting.

## Demo scenarios

### Step solving

Write, type, or recognize:

```text
2x + 4 = 10
```

Expected steps:

```text
2x + 4 = 10
2*x = 6
x = 3
```

### Reactive variables

Use the workspace:

```text
a = 5
b = 3
c = a + b
```

Caldris resolves `c = 8`. Change `a = 5` to `a = 7`, evaluate again, and `c` becomes `10`.

## API

- `GET /api/health`
- `POST /api/recognize` — optional backend fallback only
- `POST /api/solve` — `{ "expression": "2x + 4 = 10" }`
- `POST /api/workspace/evaluate` — `{ "lines": ["a=5", "b=3", "c=a+b"] }`

The primary ONNX recognizer does **not** need an API endpoint because it runs inside the browser.

## Model strategy

Prototype recognition and the eventual Caldris model are intentionally separate:

```text
v1
Texo ONNX image recognizer
        ↓
benchmark real Caldris handwriting
        ↓
collect opt-in engineering handwriting corrections
        ↓
Caldris-HMER
stroke-native small Transformer + CTC
        ↓
ONNX / browser runtime
```

See [`docs/MODEL_STRATEGY.md`](docs/MODEL_STRATEGY.md) and [`DATA_PROVENANCE.md`](DATA_PROVENANCE.md).

## Third-party model note

`alephpi/FormulaNet` is loaded as an external model and is **not vendored into this repository**. Its current Hugging Face model card identifies it as AGPL-3.0. Caldris source licensing and model licensing should remain explicitly tracked rather than silently coupling the entire project to one prototype recognizer. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Run tests

```bash
uv run pytest
```

## v1 boundaries

Not implemented yet:

- Engineering units and dimensional analysis.
- Multi-equation spatial clustering on one large page.
- Persistent notebooks or accounts.
- Diagram/circuit/FBD recognition.
- A custom stroke-native HMER model.
- General-purpose derivation for arbitrary symbolic mathematics.

See [`docs/PROTOTYPE_V1.md`](docs/PROTOTYPE_V1.md).
