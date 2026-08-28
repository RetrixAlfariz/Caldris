# Data and model provenance

Caldris should be able to answer **which data and which licenses influenced every released checkpoint**.

This file starts that record before custom training exists.

## Runtime model used by prototype v1

| Component | Role | Source | Distributed in this repo? | License note |
| --- | --- | --- | --- | --- |
| `alephpi/FormulaNet` (Texo) | primary browser ONNX recognizer | https://huggingface.co/alephpi/FormulaNet | No | Model card currently identifies AGPL-3.0 |
| TexTeller | optional backend fallback | https://github.com/OleehyO/TexTeller | No | Track upstream license/version when enabled |

The external Texo model is a prototype dependency, not yet a Caldris-trained checkpoint.

## Candidate public training/evaluation data

The following are candidates, **not an assertion that all may be combined into a redistributable production checkpoint**.

- Google MathWriting
- CROHME datasets
- HME100K
- UniMER / UniMER-1M derived resources

Before training a releasable Caldris-HMER checkpoint, record for every source:

- exact dataset version/hash
- original source URL
- license and terms
- whether commercial use is allowed
- redistribution rules
- whether derivative model weights have restrictions
- train/validation/test split provenance
- deduplication against evaluation data

## Future checkpoint manifest

Every Caldris model release should include a machine-readable manifest similar to:

```yaml
model: caldris-hmer-small
version: 0.1.0
architecture: stroke-transformer-ctc
training_data:
  - name: example-dataset
    version: exact-version
    license: exact-license
    split: train
caldris_opt_in_samples: 0
evaluation_sets: []
```

This avoids the extremely scientific practice of remembering dataset provenance six months later from browser history.
