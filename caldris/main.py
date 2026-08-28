from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from caldris.recognition import ocr_status, recognize_image, warmup_ocr
from caldris.solver import solve_expression
from caldris.workspace import evaluate_workspace

ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = ROOT / "web"

app = FastAPI(
    title="Caldris",
    version="0.1.1",
    description="Semantic handwritten computation prototype",
)
app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")


class SolveRequest(BaseModel):
    expression: str = Field(min_length=1, max_length=2_000)


class WorkspaceRequest(BaseModel):
    lines: list[str] = Field(default_factory=list, max_length=200)


@app.get("/")
def index() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")


@app.get("/api/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "prototype": "v1",
        "ocr": ocr_status(),
    }


@app.post("/api/ocr/warmup")
async def warmup() -> dict[str, object]:
    return await run_in_threadpool(warmup_ocr)


@app.post("/api/recognize")
async def recognize(file: UploadFile = File(...)) -> dict[str, object]:
    image = await file.read()
    if not image:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")
    if len(image) > 8_000_000:
        raise HTTPException(status_code=413, detail="Prototype image limit is 8 MB.")

    suffix = Path(file.filename or "ink.png").suffix or ".png"
    result = await run_in_threadpool(recognize_image, image, suffix)
    return result.to_dict()


@app.post("/api/solve")
def solve(request: SolveRequest) -> dict[str, object]:
    try:
        return solve_expression(request.expression).to_dict()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/workspace/evaluate")
def workspace(request: WorkspaceRequest) -> dict[str, object]:
    try:
        return evaluate_workspace(request.lines)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
