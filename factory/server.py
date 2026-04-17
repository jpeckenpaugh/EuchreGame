from __future__ import annotations

import json
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "factory" / "output"
JOBS_DIR = OUTPUT_DIR / "jobs"
REVIEWS_PATH = OUTPUT_DIR / "manual_reviews.jsonl"
WEB_DIR = PROJECT_ROOT / "factory" / "web"
KNOWN_JSONL_NAMES = {
    "scenarios.jsonl",
    "raw_responses.jsonl",
    "gold_dataset.jsonl",
    "rejected_responses.jsonl",
    "manual_reviews.jsonl",
}

app = FastAPI(title="Euchre Data Factory Dashboard")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class JobRequest(BaseModel):
    max_scenarios: int = Field(default=10, ge=1, le=1000)
    seed: int = 7
    winning_score: int = Field(default=10, ge=1, le=100)
    model: str = "gemma4:latest"
    host: str = "http://127.0.0.1:11434"
    timeout: float = Field(default=180.0, ge=5, le=3600)
    retries: int = Field(default=2, ge=0, le=10)


class ReviewRequest(BaseModel):
    file_id: str
    row_index: int = Field(ge=0)
    decision: str
    notes: str = ""


job_processes: dict[str, subprocess.Popen[str]] = {}


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def ensure_paths() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    JOBS_DIR.mkdir(parents=True, exist_ok=True)


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            text = line.strip()
            if text:
                rows.append(json.loads(text))
    return rows


def append_jsonl(path: Path, row: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(row, separators=(",", ":")))
        handle.write("\n")


def row_count(path: Path) -> int:
    if not path.exists():
        return 0
    with path.open("r", encoding="utf-8") as handle:
        return sum(1 for _ in handle if _.strip())


def relative_file_id(path: Path) -> str:
    return str(path.relative_to(OUTPUT_DIR)).replace("\\", "/")


def safe_output_path(file_id: str) -> Path:
    candidate = (OUTPUT_DIR / file_id).resolve()
    if OUTPUT_DIR.resolve() not in candidate.parents and candidate != OUTPUT_DIR.resolve():
        raise HTTPException(status_code=400, detail="Invalid file path.")
    if candidate.suffix != ".jsonl":
        raise HTTPException(status_code=400, detail="Only JSONL files are supported.")
    if not candidate.exists():
        raise HTTPException(status_code=404, detail="File not found.")
    return candidate


def load_review_map() -> dict[str, dict[str, Any]]:
    rows = read_jsonl(REVIEWS_PATH)
    return {str(row["source_ref"]): row for row in rows if "source_ref" in row}


def review_counts_by_file() -> dict[str, dict[str, int]]:
    counts: dict[str, dict[str, int]] = {}
    for review in read_jsonl(REVIEWS_PATH):
        file_id = str(review.get("file_id", ""))
        if not file_id:
            continue
        bucket = counts.setdefault(
            file_id,
            {"reviewed": 0, "approved": 0, "rejected": 0, "flagged": 0},
        )
        bucket["reviewed"] += 1
        decision = str(review.get("decision", "")).lower()
        if decision == "approve":
            bucket["approved"] += 1
        elif decision == "reject":
            bucket["rejected"] += 1
        elif decision == "flag":
            bucket["flagged"] += 1
    return counts


def summarize_file(path: Path) -> dict[str, Any]:
    file_id = relative_file_id(path)
    review_counts = review_counts_by_file().get(
        file_id,
        {"reviewed": 0, "approved": 0, "rejected": 0, "flagged": 0},
    )
    stat = path.stat()
    return {
        "file_id": file_id,
        "name": path.name,
        "row_count": row_count(path),
        "size_bytes": stat.st_size,
        "updated_at": datetime.fromtimestamp(stat.st_mtime, UTC).isoformat(),
        "reviews": review_counts,
    }


def list_jsonl_files() -> list[Path]:
    files: list[Path] = []
    if OUTPUT_DIR.exists():
        for path in OUTPUT_DIR.rglob("*.jsonl"):
            if path.name in KNOWN_JSONL_NAMES or "jobs" in path.parts:
                files.append(path)
    return sorted(files, key=lambda path: relative_file_id(path))


def job_summary_path(job_id: str) -> Path:
    return JOBS_DIR / job_id / "job_summary.json"


def read_job_summary(job_id: str) -> dict[str, Any] | None:
    path = job_summary_path(job_id)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def collect_jobs() -> list[dict[str, Any]]:
    ensure_paths()
    jobs: list[dict[str, Any]] = []
    for path in sorted(JOBS_DIR.glob("*/job_summary.json")):
        summary = json.loads(path.read_text(encoding="utf-8"))
        process = job_processes.get(str(summary["job_id"]))
        if process is not None and process.poll() is None:
            summary["status"] = "running"
        elif process is not None and process.poll() is not None and summary["status"] == "running":
            summary["status"] = "failed" if process.returncode else "completed"
        jobs.append(summary)
    jobs.sort(key=lambda item: item.get("started_at", ""), reverse=True)
    return jobs


def log_tail(job_id: str, max_lines: int = 120) -> list[str]:
    log_path = JOBS_DIR / job_id / "job.log"
    if not log_path.exists():
        return []
    lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    return lines[-max_lines:]


@app.on_event("startup")
def startup() -> None:
    ensure_paths()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "timestamp": utc_now()}


@app.get("/api/jobs")
def list_jobs() -> dict[str, Any]:
    return {"jobs": collect_jobs()}


@app.post("/api/jobs")
def start_job(payload: JobRequest) -> dict[str, Any]:
    ensure_paths()
    job_id = datetime.now(UTC).strftime("%Y%m%d-%H%M%S") + "-" + uuid4().hex[:6]
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    log_path = job_dir / "job.log"

    command = [
        sys.executable,
        "-m",
        "factory.run_pipeline_job",
        "--job-id",
        job_id,
        "--output-dir",
        str(job_dir),
        "--max-scenarios",
        str(payload.max_scenarios),
        "--seed",
        str(payload.seed),
        "--winning-score",
        str(payload.winning_score),
        "--model",
        payload.model,
        "--host",
        payload.host,
        "--timeout",
        str(payload.timeout),
        "--retries",
        str(payload.retries),
    ]

    log_handle = log_path.open("w", encoding="utf-8")
    process = subprocess.Popen(
        command,
        cwd=PROJECT_ROOT,
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        text=True,
    )
    log_handle.close()
    job_processes[job_id] = process

    return {
        "job_id": job_id,
        "status": "running",
        "pid": process.pid,
        "log_file": str(log_path.relative_to(PROJECT_ROOT)).replace("\\", "/"),
    }


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    summary = read_job_summary(job_id)
    if summary is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    process = job_processes.get(job_id)
    if process is not None and process.poll() is None:
        summary["status"] = "running"
    summary["log_tail"] = log_tail(job_id)
    return summary


@app.get("/api/files")
def list_files() -> dict[str, Any]:
    ensure_paths()
    return {"files": [summarize_file(path) for path in list_jsonl_files()]}


@app.get("/api/files/{file_id:path}/rows")
def get_file_rows(file_id: str, offset: int = 0, limit: int = 20) -> dict[str, Any]:
    path = safe_output_path(file_id)
    rows = read_jsonl(path)
    review_map = load_review_map()
    bounded_limit = max(1, min(limit, 100))
    sliced = rows[offset : offset + bounded_limit]
    items = []
    for index, row in enumerate(sliced, start=offset):
        source_ref = f"{file_id}:{index}"
        items.append(
            {
                "row_index": index,
                "source_ref": source_ref,
                "preview": json.dumps(row, ensure_ascii=True)[:240],
                "data": row,
                "review": review_map.get(source_ref),
            }
        )
    return {
        "file_id": file_id,
        "offset": offset,
        "limit": bounded_limit,
        "total_rows": len(rows),
        "items": items,
    }


@app.get("/api/files/{file_id:path}/summary")
def get_file_summary(file_id: str) -> dict[str, Any]:
    path = safe_output_path(file_id)
    rows = read_jsonl(path)
    sample_keys = sorted(rows[0].keys()) if rows and isinstance(rows[0], dict) else []
    return {
        "summary": summarize_file(path),
        "sample_keys": sample_keys,
    }


@app.post("/api/reviews")
def save_review(payload: ReviewRequest) -> dict[str, Any]:
    file_path = safe_output_path(payload.file_id)
    total_rows = row_count(file_path)
    if payload.row_index >= total_rows:
        raise HTTPException(status_code=400, detail="Row index is out of range.")

    decision = payload.decision.lower().strip()
    if decision not in {"approve", "reject", "flag"}:
        raise HTTPException(status_code=400, detail="Decision must be approve, reject, or flag.")

    review = {
        "file_id": payload.file_id,
        "row_index": payload.row_index,
        "source_ref": f"{payload.file_id}:{payload.row_index}",
        "decision": decision,
        "notes": payload.notes.strip(),
        "reviewed_at": utc_now(),
    }
    append_jsonl(REVIEWS_PATH, review)
    return {"ok": True, "review": review}


@app.get("/")
def dashboard() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")


app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="factory-web")
