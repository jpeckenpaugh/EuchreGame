from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "factory" / "output"
JOBS_DIR = OUTPUT_DIR / "jobs"
RUNS_DIR = OUTPUT_DIR / "runs"
DB_PATH = OUTPUT_DIR / "factory.db"
REVIEWS_PATH = OUTPUT_DIR / "manual_reviews.jsonl"
WEB_DIR = PROJECT_ROOT / "factory" / "web"
KNOWN_JSONL_NAMES = {
    "scenarios.jsonl",
    "raw_responses.jsonl",
    "gold_dataset.jsonl",
    "rejected_rows.jsonl",
    "rejected_responses.jsonl",
    "manual_reviews.jsonl",
    "trajectory.jsonl",
    "validated_rows.jsonl",
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
    RUNS_DIR.mkdir(parents=True, exist_ok=True)


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
        return sum(1 for line in handle if line.strip())


def relative_file_id(path: Path) -> str:
    return str(path.relative_to(OUTPUT_DIR)).replace("\\", "/")


def safe_output_path(file_id: str) -> Path:
    candidate = (OUTPUT_DIR / file_id).resolve()
    output_root = OUTPUT_DIR.resolve()
    if output_root not in candidate.parents and candidate != output_root:
        raise HTTPException(status_code=400, detail="Invalid file path.")
    if candidate.suffix != ".jsonl":
        raise HTTPException(status_code=400, detail="Only JSONL files are supported.")
    if not candidate.exists():
        raise HTTPException(status_code=404, detail="File not found.")
    return candidate


def load_review_map() -> dict[str, dict[str, Any]]:
    return {
        str(row["source_ref"]): row
        for row in read_jsonl(REVIEWS_PATH)
        if "source_ref" in row
    }


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
    stat = path.stat()
    return {
        "file_id": file_id,
        "name": path.name,
        "row_count": row_count(path),
        "size_bytes": stat.st_size,
        "updated_at": datetime.fromtimestamp(stat.st_mtime, UTC).isoformat(),
        "reviews": review_counts_by_file().get(
            file_id,
            {"reviewed": 0, "approved": 0, "rejected": 0, "flagged": 0},
        ),
    }


def list_jsonl_files() -> list[Path]:
    files: list[Path] = []
    if OUTPUT_DIR.exists():
        for path in OUTPUT_DIR.rglob("*.jsonl"):
            if path.name in KNOWN_JSONL_NAMES or "jobs" in path.parts or "runs" in path.parts:
                files.append(path)
    return sorted(files, key=lambda item: relative_file_id(item))


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


def open_connection() -> sqlite3.Connection:
    if not DB_PATH.exists():
        raise HTTPException(status_code=404, detail="SQLite tracking database not found.")
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def fetch_all(
    connection: sqlite3.Connection,
    query: str,
    params: tuple[Any, ...] = (),
) -> list[dict[str, Any]]:
    rows = connection.execute(query, params).fetchall()
    return [dict(row) for row in rows]


def fetch_one(
    connection: sqlite3.Connection,
    query: str,
    params: tuple[Any, ...] = (),
) -> dict[str, Any] | None:
    row = connection.execute(query, params).fetchone()
    return dict(row) if row is not None else None


def run_artifact_path(connection: sqlite3.Connection, run_id: str, kind: str) -> Path | None:
    artifact = fetch_one(
        connection,
        """
        SELECT path
        FROM artifacts
        WHERE run_id=? AND kind=?
        ORDER BY artifact_id DESC
        LIMIT 1
        """,
        (run_id, kind),
    )
    if artifact is None:
        fallback = RUNS_DIR / run_id / f"{kind}.jsonl"
        return fallback if fallback.exists() else None
    return PROJECT_ROOT / str(artifact["path"])


def summarize_failure_counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    counter = Counter()
    for row in rows:
        if row.get("transport_error"):
            counter["transport"] += 1
        bucket = str(row.get("failure_bucket") or "")
        if bucket.startswith("invalid_json"):
            counter["invalid_json"] += 1
        elif bucket:
            counter[bucket] += 1
    return dict(counter)


def load_failures_for_run(
    connection: sqlite3.Connection,
    run_id: str,
    limit: int = 100,
) -> dict[str, Any]:
    rejected_path = run_artifact_path(connection, run_id, "rejected_rows")
    if rejected_path is None or not rejected_path.exists():
        return {"items": [], "counts": {}, "total": 0}

    rows = read_jsonl(rejected_path)
    rows.reverse()
    items: list[dict[str, Any]] = []
    for index, row in enumerate(rows[:limit]):
        scenario = row.get("scenario", {})
        items.append(
            {
                "failure_id": f"{run_id}:failure:{index}",
                "backend_id": row.get("backend_id"),
                "backend_name": row.get("backend_name"),
                "game_id": row.get("game_id"),
                "phase": scenario.get("phase"),
                "turn_id": scenario.get("turn_id"),
                "legal_move_tokens": scenario.get("legal_move_tokens", []),
                "failure_bucket": row.get("failure_bucket"),
                "transport_error": row.get("transport_error"),
                "raw_response_text": row.get("rejection_detail", {})
                .get("row", {})
                .get("raw_response_text", ""),
                "compact_state": row.get("compact_state"),
                "detail": row,
            }
        )

    return {
        "items": items,
        "counts": summarize_failure_counts(rows),
        "total": len(rows),
    }


def load_game_turns(
    connection: sqlite3.Connection,
    run_id: str,
    game_id: str,
) -> list[dict[str, Any]]:
    trajectory_path = run_artifact_path(connection, run_id, "trajectory")
    if trajectory_path is None or not trajectory_path.exists():
        return []

    turns = [
        row for row in read_jsonl(trajectory_path) if str(row.get("game_id")) == game_id
    ]
    items: list[dict[str, Any]] = []
    for row in turns:
        scenario = row.get("scenario", {})
        validated = row.get("validated", {})
        raw_response = row.get("raw_response", {})
        parsed_response = raw_response.get("parsed_response") or {}
        items.append(
            {
                "turn_index": row.get("turn_index"),
                "phase": scenario.get("phase"),
                "viewer_seat": scenario.get("viewer_seat"),
                "legal_move_count": scenario.get("legal_move_count"),
                "legal_move_tokens": scenario.get("legal_move_tokens", []),
                "accepted": validated.get("accepted"),
                "parse_ok": validated.get("parse_ok"),
                "legal_ok": validated.get("legal_ok"),
                "failure_bucket": validated.get("failure_bucket"),
                "latency_ms": validated.get("latency_ms"),
                "output_move": validated.get("output_move"),
                "compact_state": (
                    validated.get("compact_state")
                    or raw_response.get("compact_state")
                ),
                "reasoning_preview": parsed_response.get("reasoning"),
                "raw_response_text": raw_response.get("raw_response_text"),
                "detail": row,
            }
        )
    return items


def load_run_detail(run_id: str) -> dict[str, Any]:
    with open_connection() as connection:
        run_row = fetch_one(
            connection,
            """
            SELECT run_id, created_at, started_at, ended_at, status, mode, prompt_version, notes
            FROM runs
            WHERE run_id=?
            """,
            (run_id,),
        )
        if run_row is None:
            raise HTTPException(status_code=404, detail="Run not found.")

        metrics = fetch_one(
            connection,
            """
            SELECT attempted_responses, accepted_gold_rows, parse_failure_rate, illegal_rate,
                   responses_per_minute, avg_latency_ms, p95_latency_ms
            FROM metrics
            WHERE run_id=?
            """,
            (run_id,),
        )
        games = fetch_all(
            connection,
            """
            SELECT game_id, backend_id, seed, status, started_at, ended_at, candidate_turns,
                   decision_turns, skipped_forced_turns, accepted_turns
            FROM games
            WHERE run_id=?
            ORDER BY game_id
            """,
            (run_id,),
        )
        backends = fetch_all(
            connection,
            """
            SELECT rb.backend_id, b.name, b.api_style, b.host, b.model, b.weight,
                   rb.assigned_games, rb.attempted_turns, rb.accepted_turns, rb.avg_latency_ms
            FROM run_backends rb
            JOIN backends b ON b.backend_id = rb.backend_id
            WHERE rb.run_id=?
            ORDER BY rb.backend_id
            """,
            (run_id,),
        )
        artifacts = fetch_all(
            connection,
            """
            SELECT kind, path, row_count, size_bytes
            FROM artifacts
            WHERE run_id=?
            ORDER BY artifact_id
            """,
            (run_id,),
        )
        failures = load_failures_for_run(connection, run_id, limit=100)

    return {
        "run": run_row,
        "metrics": metrics or {},
        "games": games,
        "backends": backends,
        "artifacts": artifacts,
        "failures": failures,
    }


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


@app.get("/api/runs")
def list_runs(limit: int = Query(default=25, ge=1, le=200)) -> dict[str, Any]:
    with open_connection() as connection:
        rows = fetch_all(
            connection,
            """
            SELECT r.run_id, r.created_at, r.started_at, r.ended_at, r.status, r.mode,
                   r.prompt_version, m.attempted_responses, m.accepted_gold_rows,
                   m.parse_failure_rate, m.illegal_rate, m.responses_per_minute,
                   m.avg_latency_ms, m.p95_latency_ms,
                   COUNT(g.game_id) AS game_count
            FROM runs r
            LEFT JOIN metrics m ON m.run_id = r.run_id
            LEFT JOIN games g ON g.run_id = r.run_id
            GROUP BY r.run_id
            ORDER BY COALESCE(r.started_at, r.created_at) DESC
            LIMIT ?
            """,
            (limit,),
        )
    return {"runs": rows}


@app.get("/api/runs/{run_id}")
def get_run(run_id: str) -> dict[str, Any]:
    return load_run_detail(run_id)


@app.get("/api/runs/{run_id}/games")
def get_run_games(run_id: str) -> dict[str, Any]:
    detail = load_run_detail(run_id)
    return {"run_id": run_id, "games": detail["games"]}


@app.get("/api/runs/{run_id}/failures")
def get_run_failures(
    run_id: str,
    limit: int = Query(default=100, ge=1, le=500),
) -> dict[str, Any]:
    with open_connection() as connection:
        run_row = fetch_one(
            connection,
            "SELECT run_id FROM runs WHERE run_id=?",
            (run_id,),
        )
        if run_row is None:
            raise HTTPException(status_code=404, detail="Run not found.")
        failures = load_failures_for_run(connection, run_id, limit=limit)
    return {"run_id": run_id, **failures}


@app.get("/api/games/{game_id}")
def get_game(game_id: str) -> dict[str, Any]:
    with open_connection() as connection:
        game = fetch_one(
            connection,
            """
            SELECT game_id, run_id, backend_id, seed, status, started_at, ended_at,
                   candidate_turns, decision_turns, skipped_forced_turns, accepted_turns
            FROM games
            WHERE game_id=?
            """,
            (game_id,),
        )
        if game is None:
            raise HTTPException(status_code=404, detail="Game not found.")
        backend = fetch_one(
            connection,
            """
            SELECT name, api_style, host, model, weight
            FROM backends
            WHERE backend_id=?
            """,
            (game["backend_id"],),
        )
        turns = load_game_turns(connection, str(game["run_id"]), game_id)
    return {"game": game, "backend": backend or {}, "turns": turns}


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
    return {"summary": summarize_file(path), "sample_keys": sample_keys}


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
