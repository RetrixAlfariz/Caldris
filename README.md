# Caldris

**Caldris** is a semantic handwritten computation prototype for mathematics and engineering.

The `v1` branch is intentionally narrow: prove that handwritten math can become editable, solvable, variable-aware computation before adding heavier engineering semantics.

## Prototype flow

```text
Live ink canvas
    ↓
ink bounding-box crop
    ↓
PP-FormulaNet_plus-S (resident primary OCR)
    ↓
TexTeller CLI (optional fallback)
    ↓
editable recognized expression
    ↓
SymPy parser / solver
    ↓
simple derivation steps
    ↓
reactive variable workspace
```

## What works in v1

- Pointer/stylus/mouse drawing canvas with undo and clear.
- Automatic live capture after a short writing pause.
- Ink-region cropping instead of sending the whole canvas.
- Resident `PP-FormulaNet_plus-S` recognition through PaddleOCR's Python API.
- Optional TexTeller CLI fallback.
- Stale OCR results are discarded when new ink is added.
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

## Enable fast live handwriting OCR

Install the Caldris OCR dependencies:

```bash
uv sync --extra ocr --group dev
```

PaddleOCR also requires PaddlePaddle itself. Install the PaddlePaddle build appropriate for your machine (CPU or GPU) following the official Paddle installation instructions. Caldris does not pin a CPU PaddlePaddle wheel because doing so could replace a GPU installation.

Then run:

```bash
uv run uvicorn caldris.main:app --reload
```

Caldris will warm `PP-FormulaNet_plus-S` once after the page loads and keep the model resident. Subsequent captures call the same model instance directly with an in-memory image array.

Optional device override:

```bash
CALDRIS_OCR_DEVICE=gpu:0 uv run uvicorn caldris.main:app --reload
```

On PowerShell:

```powershell
$env:CALDRIS_OCR_DEVICE="gpu:0"
uv run uvicorn caldris.main:app --reload
```

### Optional TexTeller fallback

```bash
uv sync --extra ocr-texteller --group dev
```

If PaddleOCR cannot initialize and TexTeller is installed, Caldris falls back to the TexTeller CLI. If neither backend is available, the canvas and deterministic solver still work and the recognized expression remains manually editable.

See [`docs/OCR_RUNTIME.md`](docs/OCR_RUNTIME.md) for the optimized recognition path.

## Live-capture behavior

```text
pen stroke
    ↓
pause ~420 ms (stylus) / ~650 ms (mouse or touch)
    ↓
crop current ink bounds + padding
    ↓
resident PP-FormulaNet_plus-S
    ↓
LaTeX
    ↓
solver + steps
```

If the user starts another stroke while OCR is still running, that older result is treated as stale and is not applied to the page.

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
- `POST /api/ocr/warmup` — load the primary OCR model once and keep it resident
- `POST /api/recognize` — multipart image upload
- `POST /api/solve` — `{ "expression": "2x + 4 = 10" }`
- `POST /api/workspace/evaluate` — `{ "lines": ["a=5", "b=3", "c=a+b"] }`

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

Those belong after the prototype interaction proves itself. See [`docs/PROTOTYPE_V1.md`](docs/PROTOTYPE_V1.md).
