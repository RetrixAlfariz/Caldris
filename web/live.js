const LIVE_CAPTURE_IDLE_MS = 900;

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

function scheduleLiveCapture() {
  cancelLiveCapture();
  if (!liveCaptureAvailable) return;

  const revision = ++liveCaptureRevision;
  setRecognitionStatus("Live ink detected · waiting for a short pause…");
  liveCaptureTimer = window.setTimeout(() => runLiveCapture(revision), LIVE_CAPTURE_IDLE_MS);
}

async function runLiveCapture(revision) {
  cancelLiveCapture();

  if (liveCaptureBusy) {
    liveCaptureQueued = true;
    return;
  }
  if (revision === liveCaptureLastRevision) return;

  liveCaptureBusy = true;
  setRecognitionStatus("Live capture · recognizing current canvas…");

  try {
    const blob = await exportCanvasBlob();
    const form = new FormData();
    form.append("file", blob, "caldris-live-capture.png");

    const result = await api("/api/recognize", {
      method: "POST",
      body: form,
    });

    if (!result.text) {
      setRecognitionStatus(result.message, result.available ? "error" : "");
      return;
    }

    document.querySelector("#expressionInput").value = result.text;
    liveCaptureLastRevision = revision;
    setRecognitionStatus(`Live capture · ${result.engine}: ${result.message}`, "success");

    // Reuse the existing deterministic solver path instead of duplicating it here.
    document.querySelector("#solveButton").click();
  } catch (error) {
    setRecognitionStatus(error.message, "error");
  } finally {
    liveCaptureBusy = false;
    if (liveCaptureQueued) {
      liveCaptureQueued = false;
      scheduleLiveCapture();
    }
  }
}

canvas.addEventListener("pointerdown", cancelLiveCapture);
canvas.addEventListener("pointerup", scheduleLiveCapture);
canvas.addEventListener("pointercancel", scheduleLiveCapture);

document.querySelector("#undoButton").addEventListener("click", scheduleLiveCapture);
document.querySelector("#clearButton").addEventListener("click", () => {
  cancelLiveCapture();
  liveCaptureRevision += 1;
  setRecognitionStatus("Canvas cleared · live capture waiting for new ink.");
});

api("/api/health")
  .then((health) => {
    liveCaptureAvailable = Boolean(health.ocr && health.ocr.available);
    if (liveCaptureAvailable) {
      setRecognitionStatus("Live capture ready · write an equation and pause briefly.", "success");
    }
  })
  .catch(() => {
    liveCaptureAvailable = false;
  });
