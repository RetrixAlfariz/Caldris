const LIVE_CAPTURE_IDLE_PEN_MS = 320;
const LIVE_CAPTURE_IDLE_POINTER_MS = 520;
const LIVE_CAPTURE_PADDING = 26;

let liveCaptureTimer = null;
let liveCaptureBusy = false;
let liveCaptureQueued = false;
let liveCaptureRevision = 0;
let liveCaptureLastRevision = -1;
let localRecognizerReady = false;
let localRecognizerFailed = false;
let fallbackAvailable = false;
let requestCounter = 0;

const pendingRecognizerRequests = new Map();
const recognitionWorker = new Worker("/static/recognition-worker.js", { type: "module" });

function cancelLiveCapture() {
  if (liveCaptureTimer) window.clearTimeout(liveCaptureTimer);
  liveCaptureTimer = null;
}

function inkBounds() {
  const points = strokes.flat();
  if (!points.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, minY, maxX, maxY };
}

function exportLiveInkBlob() {
  return new Promise((resolve, reject) => {
    const bounds = inkBounds();
    if (!bounds) {
      reject(new Error("No ink to recognize."));
      return;
    }

    const scaleX = canvas.width / Math.max(cssWidth, 1);
    const scaleY = canvas.height / Math.max(cssHeight, 1);
    const minX = Math.max(0, bounds.minX - LIVE_CAPTURE_PADDING);
    const minY = Math.max(0, bounds.minY - LIVE_CAPTURE_PADDING);
    const maxX = Math.min(cssWidth, bounds.maxX + LIVE_CAPTURE_PADDING);
    const maxY = Math.min(cssHeight, bounds.maxY + LIVE_CAPTURE_PADDING);

    const sx = Math.floor(minX * scaleX);
    const sy = Math.floor(minY * scaleY);
    const sw = Math.max(1, Math.ceil((maxX - minX) * scaleX));
    const sh = Math.max(1, Math.ceil((maxY - minY) * scaleY));

    const crop = document.createElement("canvas");
    crop.width = sw;
    crop.height = sh;
    const cropContext = crop.getContext("2d");
    cropContext.fillStyle = "#ffffff";
    cropContext.fillRect(0, 0, sw, sh);
    cropContext.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

    crop.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not export the live ink crop."));
    }, "image/png");
  });
}

function localRecognition(blob) {
  return new Promise((resolve, reject) => {
    const requestId = ++requestCounter;
    pendingRecognizerRequests.set(requestId, { resolve, reject });
    recognitionWorker.postMessage({ type: "predict", requestId, blob });
  });
}

async function fallbackRecognition(blob) {
  const form = new FormData();
  form.append("file", blob, "caldris-fallback-ink.png");
  return api("/api/recognize", { method: "POST", body: form });
}

async function recognizeInk(blob) {
  if (localRecognizerReady) {
    try {
      const result = await localRecognition(blob);
      return {
        text: result.text,
        engine: "Texo ONNX",
        latency_ms: result.latencyMs,
        local: true,
      };
    } catch (error) {
      if (!fallbackAvailable) throw error;
      setRecognitionStatus(`Local ONNX failed · trying fallback: ${error.message}`, "error");
    }
  }

  if (fallbackAvailable) {
    const result = await fallbackRecognition(blob);
    return { ...result, local: false };
  }

  if (localRecognizerFailed) {
    throw new Error("Local ONNX initialization failed and no fallback recognizer is installed.");
  }
  throw new Error("Local ONNX model is still loading.");
}

function canRecognize() {
  return localRecognizerReady || fallbackAvailable;
}

function scheduleLiveCapture(event = null) {
  cancelLiveCapture();
  if (!canRecognize() || !strokes.length) return;

  const revision = ++liveCaptureRevision;
  const idleMs = event?.pointerType === "pen"
    ? LIVE_CAPTURE_IDLE_PEN_MS
    : LIVE_CAPTURE_IDLE_POINTER_MS;

  setRecognitionStatus(`Live ink detected · local capture in ${idleMs} ms…`);
  liveCaptureTimer = window.setTimeout(() => runLiveCapture(revision), idleMs);
}

async function runLiveCapture(revision) {
  cancelLiveCapture();

  if (liveCaptureBusy) {
    liveCaptureQueued = true;
    return;
  }
  if (!strokes.length || revision === liveCaptureLastRevision) return;

  liveCaptureBusy = true;
  setRecognitionStatus(localRecognizerReady
    ? "Live capture · recognizing locally with ONNX…"
    : "Live capture · using backend fallback…");

  try {
    const blob = await exportLiveInkBlob();
    const result = await recognizeInk(blob);

    if (revision !== liveCaptureRevision) {
      liveCaptureQueued = true;
      return;
    }

    if (!result.text) {
      setRecognitionStatus(result.message || "Recognizer returned no formula.", "error");
      return;
    }

    expressionInput.value = result.text;
    liveCaptureLastRevision = revision;
    const latency = result.latency_ms ? ` · ${Math.round(result.latency_ms)} ms` : "";
    const location = result.local ? " · local" : " · fallback";
    setRecognitionStatus(`Live · ${result.engine}${location}${latency}`, "success");
    document.querySelector("#solveButton").click();
  } catch (error) {
    setRecognitionStatus(error.message, "error");
  } finally {
    liveCaptureBusy = false;
    if (liveCaptureQueued && strokes.length) {
      liveCaptureQueued = false;
      const queuedRevision = liveCaptureRevision;
      window.setTimeout(() => runLiveCapture(queuedRevision), 70);
    }
  }
}

recognitionWorker.addEventListener("message", (event) => {
  const message = event.data || {};

  if (message.type === "ready") {
    localRecognizerReady = true;
    localRecognizerFailed = false;
    healthBadge.textContent = "runtime ready · Texo ONNX local";
    healthBadge.className = "health ready";
    setRecognitionStatus(
      `Texo ONNX ready locally · ${Math.round(message.loadMs || 0)} ms initial load`,
      "success",
    );
    if (strokes.length) scheduleLiveCapture();
    return;
  }

  if (message.type === "progress") {
    const progress = Number.isFinite(message.progress) ? Math.round(message.progress) : null;
    if (!strokes.length) {
      setRecognitionStatus(progress === null
        ? "Loading Texo ONNX in browser…"
        : `Loading Texo ONNX · ${progress}%`);
    }
    return;
  }

  if (message.type === "result") {
    const pending = pendingRecognizerRequests.get(message.requestId);
    if (!pending) return;
    pendingRecognizerRequests.delete(message.requestId);
    pending.resolve(message);
    return;
  }

  if (message.type === "error") {
    const pending = pendingRecognizerRequests.get(message.requestId);
    if (pending) {
      pendingRecognizerRequests.delete(message.requestId);
      pending.reject(new Error(message.message));
      return;
    }

    localRecognizerReady = false;
    localRecognizerFailed = true;
    healthBadge.textContent = fallbackAvailable
      ? "runtime ready · ONNX failed · fallback ready"
      : "runtime ready · ONNX unavailable";
    healthBadge.className = "health partial";
    setRecognitionStatus(`Local ONNX initialization failed: ${message.message}`, "error");
  }
});

recognitionWorker.addEventListener("error", (event) => {
  localRecognizerReady = false;
  localRecognizerFailed = true;
  setRecognitionStatus(`Recognition worker failed: ${event.message}`, "error");
});

canvas.addEventListener("pointerdown", () => {
  cancelLiveCapture();
  liveCaptureRevision += 1;
  if (liveCaptureBusy) liveCaptureQueued = true;
});
canvas.addEventListener("pointerup", scheduleLiveCapture);
canvas.addEventListener("pointercancel", scheduleLiveCapture);

document.querySelector("#undoButton").addEventListener("click", () => scheduleLiveCapture());
document.querySelector("#clearButton").addEventListener("click", () => {
  cancelLiveCapture();
  liveCaptureRevision += 1;
  liveCaptureQueued = false;
  setRecognitionStatus("Canvas cleared · live recognition waiting for new ink.");
});

document.querySelector("#recognizeButton").addEventListener("click", () => {
  if (!strokes.length) {
    setRecognitionStatus("Write something on the canvas first.", "error");
    return;
  }
  liveCaptureRevision += 1;
  runLiveCapture(liveCaptureRevision);
});

api("/api/health")
  .then((health) => {
    fallbackAvailable = Boolean(health.recognition?.fallback?.available);
    setRecognitionStatus("Loading Texo ONNX locally in the browser…");
    recognitionWorker.postMessage({ type: "init" });
  })
  .catch(() => {
    fallbackAvailable = false;
    recognitionWorker.postMessage({ type: "init" });
  });
