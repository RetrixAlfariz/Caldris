# Caldris Prototype v1

## Purpose

The first prototype exists to validate one interaction:

> handwritten mathematics can become an editable semantic object that can be solved and can participate in a reactive variable workspace.

Recognition and computation stay separated. The current Texo ONNX adapter can be replaced without redesigning the solver or workspace.

## Current architecture

```text
Browser pointer/stylus input
        ↓
retained raw strokes
        ↓
ink bounding-box raster crop
        ↓
Texo ONNX browser worker
        └─ TexTeller backend fallback (optional)
        ↓
Editable expression string
        ↓
SymPy parsing
        ├─ equation solver
        └─ basic derivation formatter
        ↓
Variable workspace
        ├─ assignment extraction
        ├─ dependency resolution
        ├─ circular dependency detection
        └─ recalculation
```

## Prototype success criteria

1. Write an equation and have local ONNX recognition trigger after a short pause.
2. Correct recognition output without redrawing.
3. Solve a one-variable linear equation and show intermediate steps.
4. Resolve `a = 5`, `b = 3`, `c = a + b` to `c = 8`.
5. Change `a` to `7` and resolve `c = 10`.
6. Reject circular assignments such as `a = b + 1`, `b = a + 1`.
7. Keep the ML recognizer replaceable behind a small adapter boundary.

## Deliberately deferred

### Engineering units

`R = 10 kΩ`, `I = 2 mA`, and dimensional checking belong in the next semantic layer. They should not be implemented as string hacks inside the current parser.

### Stroke-native recognition

The canvas already retains `(x, y, pressure, timestamp)` stroke information, but Texo consumes a raster crop. The intended research successor is a small stroke-native Transformer/CTC recognizer exported to ONNX.

### General derivation engine

The current step formatter handles basic linear equations and a small quadratic path. A later rule engine should represent transformations and preconditions explicitly instead of reconstructing prose after solving.

### Engineering diagrams

Circuit diagrams, free-body diagrams, control blocks, and kinematic sketches remain out of scope until equation semantics are stable.

## Next candidate milestones

- Benchmark recognition on Caldris-specific handwriting before swapping models again.
- Add engineering quantities and units.
- Add spatial stroke clustering for multiple independent equation blocks.
