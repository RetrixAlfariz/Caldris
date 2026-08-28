# Caldris

**Caldris** is a semantic handwritten computation prototype for mathematics and engineering.

The `v1` branch is intentionally narrow: prove that handwritten math can become editable, solvable, variable-aware computation before adding heavier engineering semantics.

## Prototype flow

```text
Ink canvas
    ↓
TexTeller adapter (optional)
    ↓
Editable recognized expression
    ↓
SymPy parser / solver
    ↓
Simple derivation steps
    ↓
Reactive variable workspace
```

## What works in v1

- Pointer/stylus/mouse drawing canvas with undo and clear.
- Optional TexTeller CLI adapter for handwritten formula recognition.
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

### Enable handwriting OCR

TexTeller is optional because it is substantially heavier than the semantic prototype itself.

```bash
uv sync --extra ocr --group dev
uv run uvicorn caldris.main:app --reload
```

Caldris detects the `texteller` CLI automatically and calls:

```bash
texteller inference <image>
```

If TexTeller is unavailable, the canvas still works and the recognized-expression field can be edited manually. This is deliberate: OCR is an adapter, not the core runtime.

## Demo scenarios

### Step solving

Enter or recognize:

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
- Persistent notebooks or accounts.
- Diagram/circuit/FBD recognition.
- A custom stroke-native HMER model.
- General-purpose derivation for arbitrary symbolic mathematics.

Those belong after the prototype interaction proves itself. See [`docs/PROTOTYPE_V1.md`](docs/PROTOTYPE_V1.md).
