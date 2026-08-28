# Caldris Prototype v1

## Purpose

The first prototype exists to validate one interaction:

> handwritten mathematics can become an editable semantic object that can be solved and can participate in a reactive variable workspace.

The prototype intentionally separates recognition from computation. TexTeller may be replaced later without redesigning the solver or workspace.

## Current architecture

```text
Browser pointer/stylus input
        ↓
Canvas raster export
        ↓
Recognition adapter
  └─ TexTeller CLI (optional)
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

1. Draw an equation and send it to the OCR adapter.
2. Correct the OCR output without redrawing.
3. Solve a one-variable linear equation and show intermediate steps.
4. Resolve `a = 5`, `b = 3`, `c = a + b` to `c = 8`.
5. Change `a` to `7` and resolve `c = 10`.
6. Reject circular assignments such as `a = b + 1`, `b = a + 1`.

## Deliberately deferred

### Engineering units

`R = 10 kΩ`, `I = 2 mA`, and dimensional checking belong in the next semantic layer. They should not be implemented as string hacks inside the current parser.

### Stroke-native recognition

The canvas retains strokes in the browser, but v1 rasterizes them before recognition. A future HMER research branch can consume the stroke sequence directly.

### General derivation engine

The current step formatter handles basic linear equations and a small quadratic path. A later rule engine should represent transformations and preconditions explicitly instead of reconstructing prose after solving.

### Engineering diagrams

Circuit diagrams, free-body diagrams, control blocks, and kinematic sketches remain out of scope until equation semantics are stable.

## Next candidate milestone

`v1.1`: engineering quantities and units, with explicit quantity objects and dimensional validation.
