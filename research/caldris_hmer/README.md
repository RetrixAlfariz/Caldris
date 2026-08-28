# Caldris-HMER research track

Goal: replace raster image OCR in the live path with a small model that consumes Caldris' native stroke stream.

Initial hypothesis:

```text
stroke sequence
    ↓
normalization / resampling
    ↓
Transformer encoder
    ↓
CTC head
    ↓
math token sequence
    ↓
ONNX
```

## Input candidate

Each point can preserve:

```text
x, y, relative_time, pressure, pen_up
```

Ablate features rather than assuming all of them help.

## First milestones

1. Define a deterministic stroke serialization format.
2. Reproduce a public online-HMER baseline.
3. Export the baseline to ONNX and measure browser latency.
4. Build `Caldris-HME-500` for engineering-oriented evaluation.
5. Only then decide whether custom training materially beats existing models.

The point is to earn a custom model with measurements, not create one because naming models is fun.
