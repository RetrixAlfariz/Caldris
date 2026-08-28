const LIVE_CAPTURE_IDLE_PEN_MS = 420;
const LIVE_CAPTURE_IDLE_POINTER_MS = 650;
const LIVE_CAPTURE_PADDING = 26;

let liveCaptureAvailable = false;
let liveCaptureTimer = null;
let liveCaptureBusy = false;
let liveCaptureQueued = false;
let liveCaptureRevision = 0;
let liveCaptureLastRevision = -1;

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

function scheduleLiveCapture(event = null) {
  cancelLiveCapture();
  if (!liveCaptureAvailable || !strokes.length) return;

  const revision = ++liveCaptureRevision;
  const idleMs = event?.pointerType === "pen"
    ? LIVE_CAPTURE_IDLE_PEN_MS
    : LIVE_CAPTURE_IDLE_POINTER_MS;

  setRecognitionStatus(`Live ink detected · capture in ${idleMs} ms…`);
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
  setRecognitionStatus("Live capture · recognizing cropped ink…");

  try {
    const blob = await exportLiveInkBlob();
    const form = new FormData();
    form.append("file", blob, "caldris-live-ink.png");

    const result = await api("/api/recognize", {
      method: "POST",
      body: form,
    });

    // A new pen stroke invalidates an older OCR result. Do not let stale
    // recognition overwrite what the user is currently writing.
    if (revision !== liveCaptureRevision) {
      liveCaptureQueued = true;
      return;
    }

    if (!result.text) {
      setRecognitionStatus(result.message, result.available ? "error" : "");
      return;
    }

    expressionInput.value = result.text;
    liveCaptureLastRevision = revision;
    const latency = result.latency_ms ? ` · ${Math.round(result.latency_ms)} ms` : "";
    const resident = result.resident ? " · resident" : "";
    setRecognitionStatus(`Live · ${result.engine}${resident}${latency}`, "success");

    // Keep arithmetic deterministic: recognition feeds the existing solver.
    document.querySelector("#solveButton").click();
  } catch (error) {
    setRecognitionStatus(error.message, "error");
  } finally {
    liveCaptureBusy = false;
    if (liveCaptureQueued && strokes.length) {
      liveCaptureQueued = false;
      cancelLiveCapture();
      const queuedRevision = liveCaptureRevision;
      window.setTimeout(() => runLiveCapture(queuedRevision), 80);
    }
  }
}

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
  setRecognitionStatus("Canvas cleared · live capture waiting for new ink.");
});

api("/api/health")
  .then(async (health) => {
    liveCaptureAvailable = Boolean(health.ocr && health.ocr.available);
    if (!liveCaptureAvailable) return;

    if (health.ocr.primary_installed) {
      if (!strokes.length) {
        setRecognitionStatus(`Loading ${health.ocr.primary} once for live inference…`);
      }
      const warmed = await api("/api/ocr/warmup", { method: "POST" });
      liveCaptureAvailable = Boolean(warmed.resident || warmed.fallback);

      if (!strokes.length) {
        if (warmed.resident) {
          setRecognitionStatus(
            `Live capture ready · ${warmed.primary} resident (${Math.round(warmed.warmup_ms || 0)} ms warmup).`,
            "success",
          );
        } else if (warmed.fallback) {
          setRecognitionStatus(`Primary OCR failed; live capture will use ${warmed.fallback}.`, "error");
        } else {
          setRecognitionStatus(warmed.load_error || "OCR initialization failed.", "error");
        }
      }
    } else if (!strokes.length) {
      setRecognitionStatus(`Live capture ready · ${health.ocr.engine}.`, "success");
    }
  })
  .catch(() => {
    liveCaptureAvailable = false;
  });
