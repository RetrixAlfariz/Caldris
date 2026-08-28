import {
  PreTrainedTokenizer,
  Tensor,
  VisionEncoderDecoderModel,
  cat,
  env,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5/+esm";

const MODEL_ID = "alephpi/FormulaNet";
const INPUT_SIZE = 384;
const MEAN = 0.7931;
const STD = 0.1738;
const INK_THRESHOLD = 200;

let model = null;
let tokenizer = null;
let ready = false;

env.allowLocalModels = false;

function emit(type, payload = {}) {
  self.postMessage({ type, ...payload });
}

async function initialize() {
  if (ready) return;

  const started = performance.now();
  emit("loading", { model: MODEL_ID });

  model = await VisionEncoderDecoderModel.from_pretrained(MODEL_ID, {
    dtype: "fp32",
    progress_callback: (info) => {
      if (typeof info?.progress === "number") {
        emit("progress", {
          progress: info.progress,
          file: info.file || "model",
        });
      }
    },
  });
  tokenizer = await PreTrainedTokenizer.from_pretrained(MODEL_ID);
  ready = true;

  emit("ready", {
    model: MODEL_ID,
    loadMs: Math.round(performance.now() - started),
  });
}

function grayscale(r, g, b) {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

async function preprocess(blob) {
  if (typeof OffscreenCanvas === "undefined") {
    throw new Error("OffscreenCanvas is unavailable in this browser.");
  }

  const bitmap = await createImageBitmap(blob);
  const source = new OffscreenCanvas(bitmap.width, bitmap.height);
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  sourceContext.fillStyle = "#ffffff";
  sourceContext.fillRect(0, 0, source.width, source.height);
  sourceContext.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  const rgba = sourceContext.getImageData(0, 0, source.width, source.height).data;
  const gray = new Uint8ClampedArray(source.width * source.height);
  let darkPixels = 0;
  let lightPixels = 0;

  for (let i = 0, p = 0; i < rgba.length; i += 4, p += 1) {
    const value = grayscale(rgba[i], rgba[i + 1], rgba[i + 2]);
    gray[p] = value;
    if (value < INK_THRESHOLD) darkPixels += 1;
    else lightPixels += 1;
  }

  if (darkPixels >= lightPixels) {
    for (let i = 0; i < gray.length; i += 1) gray[i] = 255 - gray[i];
  }

  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      if (gray[y * source.width + x] < INK_THRESHOLD) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error("No recognizable ink was found in the crop.");
  }

  const cropWidth = Math.max(1, maxX - minX + 1);
  const cropHeight = Math.max(1, maxY - minY + 1);
  const grayCanvas = new OffscreenCanvas(source.width, source.height);
  const grayContext = grayCanvas.getContext("2d");
  const grayImage = grayContext.createImageData(source.width, source.height);

  for (let i = 0; i < gray.length; i += 1) {
    const offset = i * 4;
    grayImage.data[offset] = gray[i];
    grayImage.data[offset + 1] = gray[i];
    grayImage.data[offset + 2] = gray[i];
    grayImage.data[offset + 3] = 255;
  }
  grayContext.putImageData(grayImage, 0, 0);

  const scale = Math.min(INPUT_SIZE / cropWidth, INPUT_SIZE / cropHeight);
  const targetWidth = Math.max(1, Math.round(cropWidth * scale));
  const targetHeight = Math.max(1, Math.round(cropHeight * scale));
  const offsetX = Math.floor((INPUT_SIZE - targetWidth) / 2);
  const offsetY = Math.floor((INPUT_SIZE - targetHeight) / 2);

  const target = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE);
  const targetContext = target.getContext("2d", { willReadFrequently: true });
  targetContext.fillStyle = "#000000";
  targetContext.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  targetContext.drawImage(
    grayCanvas,
    minX,
    minY,
    cropWidth,
    cropHeight,
    offsetX,
    offsetY,
    targetWidth,
    targetHeight,
  );

  const targetData = targetContext.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;
  const normalized = new Float32Array(INPUT_SIZE * INPUT_SIZE);
  for (let i = 0, p = 0; i < targetData.length; i += 4, p += 1) {
    normalized[p] = (targetData[i] / 255 - MEAN) / STD;
  }

  const mono = new Tensor("float32", normalized, [1, 1, INPUT_SIZE, INPUT_SIZE]);
  return cat([mono, mono, mono], 1);
}

async function predict(blob) {
  if (!ready) await initialize();

  const started = performance.now();
  const pixelValues = await preprocess(blob);
  const outputIds = await model.generate({ inputs: pixelValues });
  const text = tokenizer.batch_decode(outputIds, { skip_special_tokens: true })[0]?.trim() || "";

  return {
    text,
    latencyMs: Math.round(performance.now() - started),
  };
}

self.onmessage = async (event) => {
  const { type, requestId, blob } = event.data || {};

  try {
    if (type === "init") {
      await initialize();
      return;
    }

    if (type === "predict") {
      const result = await predict(blob);
      emit("result", { requestId, ...result });
    }
  } catch (error) {
    emit("error", {
      requestId: requestId ?? null,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
