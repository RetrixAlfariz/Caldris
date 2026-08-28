# Third-party notices

Caldris v1 can load third-party software and model artifacts at runtime. These components are not automatically relicensed by this repository.

## Texo / FormulaNet

- Model: `alephpi/FormulaNet`
- Source: https://huggingface.co/alephpi/FormulaNet
- Project: https://github.com/alephpi/Texo
- Purpose: primary prototype formula recognizer
- Execution: ONNX in the browser through Transformers.js
- Model-card license at the time of integration: AGPL-3.0
- Vendored in Caldris: **No**

## Transformers.js

- Project: https://github.com/huggingface/transformers.js
- Purpose: browser model loading and ONNX inference orchestration
- Loaded remotely in the v1 prototype; production builds should pin/vendor an audited version.

## TexTeller

- Project: https://github.com/OleehyO/TexTeller
- Purpose: optional backend recognition fallback
- Installed only through the `ocr-texteller` optional dependency.

Before a tagged public release, verify upstream versions and licenses again rather than assuming this prototype notice remains eternally correct. Software ecosystems enjoy changing underneath people who have deadlines.
