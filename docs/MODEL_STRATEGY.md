# Caldris model strategy

## v1: prove the interaction, not the final model

The current primary recognizer is `alephpi/FormulaNet` (Texo), loaded as ONNX in a browser worker. It is small enough for an interactive prototype and has public ONNX/browser deployment precedent.

It is **not** treated as Caldris' permanent model. Texo remains image-based while Caldris owns richer online ink data such as stroke order, timing, and pressure.

## Benchmark before training

Create a Caldris handwriting benchmark that reflects actual engineering use rather than selecting models only from published aggregate scores.

Suggested first set: 500 expressions.

- 100 algebra
- 100 calculus
- 100 matrices / linear algebra
- 100 electrical / control notation
- 100 robotics / mechanics notation

Measure:

- exact expression match
- token/character error rate
- parse success rate in Caldris
- p50 and p95 inference latency
- cold model-load time
- peak memory
- correction frequency

## Future: Caldris-HMER

Preferred research direction:

```text
raw online ink
(x, y, time, pressure, stroke boundaries)
        ↓
small Transformer encoder
        ↓
CTC token head
        ↓
LaTeX / math token sequence
        ↓
ONNX export
```

Why this direction:

- removes rasterization from the hot path
- uses information an image OCR model throws away
- parallel CTC decoding is attractive for low-latency handwriting
- encoder-only export is simpler than a large autoregressive VLM
- can be specialized for engineering notation

A ~tens-of-millions parameter class is the research target, not a promise. Benchmark latency and accuracy should decide the final size.

## Data strategy

Do not wait for a huge proprietary dataset before experimenting. Start from eligible public research data, then collect a much smaller but higher-value Caldris-specific set.

Useful Caldris-native data sources:

1. **Prompted collection** — show a known formula and ask a contributor to write it. The label already exists, so no manual transcription is required.
2. **Correction pairs** — when recognition is wrong and the user corrects the expression, retain the pair only with explicit dataset opt-in.
3. **Engineering oversampling** — intentionally collect symbols and patterns such as `θ`, `ρ`, `ω`, `Ω`, subscripts, dotted variables, transfer functions, matrices, and robotics transforms.

## Teacher / fallback models

Larger recognizers can remain useful as offline teachers or hard-example annotators. They do not belong in the live pen-up path unless latency measurements justify them.
