const canvas = document.querySelector("#inkCanvas");
const ctx = canvas.getContext("2d");
const expressionInput = document.querySelector("#expressionInput");
const recognitionStatus = document.querySelector("#recognitionStatus");
const healthBadge = document.querySelector("#healthBadge");
const variablesOutput = document.querySelector("#variablesOutput");
const solutionOutput = document.querySelector("#solutionOutput");
const stepsOutput = document.querySelector("#stepsOutput");
const workspaceInput = document.querySelector("#workspaceInput");
const workspaceOutput = document.querySelector("#workspaceOutput");

let strokes = [];
let activeStroke = null;
let drawing = false;
let cssWidth = 0;
let cssHeight = 0;

function setupCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  cssWidth = rect.width;
  cssHeight = rect.height;
  canvas.width = Math.max(1, Math.floor(cssWidth * ratio));
  canvas.height = Math.max(1, Math.floor(cssHeight * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#17191c";
  ctx.lineWidth = 3.2;
  redraw();
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    pressure: event.pressure || 0.5,
  };
}

function redraw() {
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  for (const stroke of strokes) {
    if (stroke.length < 1) continue;
    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);
    for (const point of stroke.slice(1)) {
      ctx.lineTo(point.x, point.y);
    }
    if (stroke.length === 1) ctx.lineTo(stroke[0].x + 0.01, stroke[0].y + 0.01);
    ctx.stroke();
  }
}

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  drawing = true;
  activeStroke = [pointFromEvent(event)];
  strokes.push(activeStroke);
  redraw();
});

canvas.addEventListener("pointermove", (event) => {
  if (!drawing || !activeStroke) return;
  activeStroke.push(pointFromEvent(event));
  redraw();
});

function endStroke(event) {
  if (!drawing) return;
  drawing = false;
  activeStroke = null;
  if (event && canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointercancel", endStroke);

window.addEventListener("resize", () => {
  window.clearTimeout(window.__caldrisResize);
  window.__caldrisResize = window.setTimeout(setupCanvas, 100);
});

document.querySelector("#undoButton").addEventListener("click", () => {
  strokes.pop();
  redraw();
});

document.querySelector("#clearButton").addEventListener("click", () => {
  strokes = [];
  redraw();
});

document.querySelector("#exampleButton").addEventListener("click", () => {
  expressionInput.value = "2x + 4 = 10";
});

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || `Request failed (${response.status})`);
  return payload;
}

function setRecognitionStatus(message, kind = "") {
  recognitionStatus.textContent = message;
  recognitionStatus.className = `status ${kind}`.trim();
}

function exportCanvasBlob() {
  return new Promise((resolve, reject) => {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const exportContext = exportCanvas.getContext("2d");
    exportContext.fillStyle = "#ffffff";
    exportContext.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    exportContext.drawImage(canvas, 0, 0);
    exportCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not export the canvas."));
    }, "image/png");
  });
}

document.querySelector("#recognizeButton").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  setRecognitionStatus("Sending ink to the recognition adapter…");

  try {
    const blob = await exportCanvasBlob();
    const form = new FormData();
    form.append("file", blob, "caldris-ink.png");
    const result = await api("/api/recognize", { method: "POST", body: form });
    if (result.text) {
      expressionInput.value = result.text;
      setRecognitionStatus(`${result.engine}: ${result.message}`, "success");
    } else {
      setRecognitionStatus(result.message, result.available ? "error" : "");
    }
  } catch (error) {
    setRecognitionStatus(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

function renderVariables(variables) {
  variablesOutput.innerHTML = "";
  if (!variables.length) {
    variablesOutput.textContent = "No free variables";
    variablesOutput.className = "chips muted";
    return;
  }
  variablesOutput.className = "chips";
  for (const variable of variables) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = variable;
    variablesOutput.appendChild(chip);
  }
}

function renderSteps(steps) {
  stepsOutput.innerHTML = "";
  for (const step of steps) {
    const item = document.createElement("li");
    item.textContent = step;
    stepsOutput.appendChild(item);
  }
}

document.querySelector("#solveButton").addEventListener("click", async (event) => {
  const expression = expressionInput.value.trim();
  const button = event.currentTarget;
  if (!expression) return;
  button.disabled = true;

  try {
    const result = await api("/api/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expression }),
    });
    renderVariables(result.variables || []);
    solutionOutput.className = "solution";
    solutionOutput.textContent = (result.solutions || []).join("   |   ") || "No solution returned";
    renderSteps(result.steps || []);
  } catch (error) {
    solutionOutput.className = "solution";
    solutionOutput.textContent = error.message;
    stepsOutput.innerHTML = '<li class="muted">Fix the expression and solve again.</li>';
  } finally {
    button.disabled = false;
  }
});

function renderWorkspace(entries) {
  workspaceOutput.innerHTML = "";
  workspaceOutput.className = "workspace-output";
  if (!entries.length) {
    workspaceOutput.textContent = "No assignments.";
    workspaceOutput.classList.add("muted");
    return;
  }

  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "variable-row";

    const symbol = document.createElement("div");
    symbol.className = "symbol";
    symbol.textContent = entry.symbol;

    const value = document.createElement("div");
    value.textContent = `= ${entry.value}`;

    const dependency = document.createElement("div");
    dependency.className = "dependency";
    dependency.textContent = entry.dependencies.length
      ? `depends: ${entry.dependencies.join(", ")}`
      : "source";

    row.append(symbol, value, dependency);
    workspaceOutput.appendChild(row);
  }
}

document.querySelector("#evaluateButton").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const lines = workspaceInput.value.split("\n").map((line) => line.trim()).filter(Boolean);
  button.disabled = true;

  try {
    const result = await api("/api/workspace/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines }),
    });
    renderWorkspace(result.entries || []);
  } catch (error) {
    workspaceOutput.className = "workspace-output";
    workspaceOutput.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

async function loadHealth() {
  try {
    const health = await api("/api/health");
    if (health.ocr.available) {
      healthBadge.textContent = "runtime ready · OCR ready";
      healthBadge.className = "health ready";
    } else {
      healthBadge.textContent = "runtime ready · OCR optional";
      healthBadge.className = "health partial";
    }
  } catch {
    healthBadge.textContent = "runtime unavailable";
  }
}

setupCanvas();
loadHealth();
