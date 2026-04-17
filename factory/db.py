from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

SCHEMA = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    started_at TEXT,
    ended_at TEXT,
    status TEXT NOT NULL,
    mode TEXT NOT NULL,
    prompt_version TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS backends (
    backend_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    api_style TEXT NOT NULL,
    host TEXT NOT NULL,
    model TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    weight REAL NOT NULL DEFAULT 1.0,
    last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS run_backends (
    run_id TEXT NOT NULL,
    backend_id TEXT NOT NULL,
    assigned_games INTEGER NOT NULL DEFAULT 0,
    attempted_turns INTEGER NOT NULL DEFAULT 0,
    accepted_turns INTEGER NOT NULL DEFAULT 0,
    avg_latency_ms REAL,
    PRIMARY KEY (run_id, backend_id)
);

CREATE TABLE IF NOT EXISTS games (
    game_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    backend_id TEXT NOT NULL,
    seed INTEGER NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT,
    ended_at TEXT,
    candidate_turns INTEGER NOT NULL DEFAULT 0,
    decision_turns INTEGER NOT NULL DEFAULT 0,
    skipped_forced_turns INTEGER NOT NULL DEFAULT 0,
    accepted_turns INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS artifacts (
    artifact_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    game_id TEXT,
    kind TEXT NOT NULL,
    path TEXT NOT NULL,
    row_count INTEGER,
    size_bytes INTEGER
);

CREATE TABLE IF NOT EXISTS reviews (
    review_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    artifact_path TEXT NOT NULL,
    row_index INTEGER NOT NULL,
    decision TEXT NOT NULL,
    notes TEXT,
    reviewed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS metrics (
    run_id TEXT PRIMARY KEY,
    attempted_responses INTEGER NOT NULL DEFAULT 0,
    accepted_gold_rows INTEGER NOT NULL DEFAULT 0,
    parse_failure_rate REAL,
    illegal_rate REAL,
    responses_per_minute REAL,
    avg_latency_ms REAL,
    p95_latency_ms REAL
);
"""


def connect(db_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.executescript(SCHEMA)
    return connection


@contextmanager
def open_db(db_path: Path) -> Iterator[sqlite3.Connection]:
    connection = connect(db_path)
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def create_run(
    connection: sqlite3.Connection,
    *,
    run_id: str,
    created_at: str,
    mode: str,
    prompt_version: str,
    notes: str | None = None,
) -> None:
    connection.execute(
        """
        INSERT INTO runs(run_id, created_at, status, mode, prompt_version, notes)
        VALUES (?, ?, 'created', ?, ?, ?)
        """,
        (run_id, created_at, mode, prompt_version, notes),
    )


def start_run(connection: sqlite3.Connection, *, run_id: str, started_at: str) -> None:
    connection.execute(
        "UPDATE runs SET status='running', started_at=? WHERE run_id=?",
        (started_at, run_id),
    )


def finish_run(
    connection: sqlite3.Connection,
    *,
    run_id: str,
    ended_at: str,
    status: str,
) -> None:
    connection.execute(
        "UPDATE runs SET status=?, ended_at=? WHERE run_id=?",
        (status, ended_at, run_id),
    )


def upsert_backend(connection: sqlite3.Connection, backend: dict[str, Any], seen_at: str) -> None:
    connection.execute(
        """
        INSERT INTO backends(
            backend_id, name, api_style, host, model, enabled, weight, last_seen_at
        )
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(backend_id) DO UPDATE SET
            name=excluded.name,
            api_style=excluded.api_style,
            host=excluded.host,
            model=excluded.model,
            weight=excluded.weight,
            last_seen_at=excluded.last_seen_at
        """,
        (
            backend["backend_id"],
            backend["name"],
            backend["api_style"],
            backend["host"],
            backend["model"],
            backend["weight"],
            seen_at,
        ),
    )


def register_run_backend(connection: sqlite3.Connection, *, run_id: str, backend_id: str) -> None:
    connection.execute(
        """
        INSERT INTO run_backends(run_id, backend_id)
        VALUES (?, ?)
        ON CONFLICT(run_id, backend_id) DO NOTHING
        """,
        (run_id, backend_id),
    )


def create_game(
    connection: sqlite3.Connection,
    *,
    game_id: str,
    run_id: str,
    backend_id: str,
    seed: int,
    started_at: str,
) -> None:
    connection.execute(
        """
        INSERT INTO games(game_id, run_id, backend_id, seed, status, started_at)
        VALUES (?, ?, ?, ?, 'running', ?)
        """,
        (game_id, run_id, backend_id, seed, started_at),
    )
    connection.execute(
        """
        UPDATE run_backends
        SET assigned_games = assigned_games + 1
        WHERE run_id=? AND backend_id=?
        """,
        (run_id, backend_id),
    )


def finish_game(
    connection: sqlite3.Connection,
    *,
    game_id: str,
    ended_at: str,
    status: str,
    candidate_turns: int,
    decision_turns: int,
    skipped_forced_turns: int,
    accepted_turns: int,
) -> None:
    connection.execute(
        """
        UPDATE games
        SET status=?, ended_at=?, candidate_turns=?, decision_turns=?,
            skipped_forced_turns=?, accepted_turns=?
        WHERE game_id=?
        """,
        (
            status,
            ended_at,
            candidate_turns,
            decision_turns,
            skipped_forced_turns,
            accepted_turns,
            game_id,
        ),
    )


def update_run_backend_metrics(
    connection: sqlite3.Connection,
    *,
    run_id: str,
    backend_id: str,
    attempted_turns: int,
    accepted_turns: int,
    avg_latency_ms: float | None,
) -> None:
    connection.execute(
        """
        UPDATE run_backends
        SET attempted_turns=?, accepted_turns=?, avg_latency_ms=?
        WHERE run_id=? AND backend_id=?
        """,
        (attempted_turns, accepted_turns, avg_latency_ms, run_id, backend_id),
    )


def register_artifact(
    connection: sqlite3.Connection,
    *,
    run_id: str,
    game_id: str | None,
    kind: str,
    path: str,
    row_count: int | None,
    size_bytes: int | None,
) -> None:
    connection.execute(
        """
        INSERT INTO artifacts(run_id, game_id, kind, path, row_count, size_bytes)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (run_id, game_id, kind, path, row_count, size_bytes),
    )


def upsert_run_metrics(
    connection: sqlite3.Connection,
    *,
    run_id: str,
    attempted_responses: int,
    accepted_gold_rows: int,
    parse_failure_rate: float,
    illegal_rate: float,
    responses_per_minute: float,
    avg_latency_ms: float | None,
    p95_latency_ms: float | None,
) -> None:
    connection.execute(
        """
        INSERT INTO metrics(
            run_id, attempted_responses, accepted_gold_rows, parse_failure_rate,
            illegal_rate, responses_per_minute, avg_latency_ms, p95_latency_ms
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET
            attempted_responses=excluded.attempted_responses,
            accepted_gold_rows=excluded.accepted_gold_rows,
            parse_failure_rate=excluded.parse_failure_rate,
            illegal_rate=excluded.illegal_rate,
            responses_per_minute=excluded.responses_per_minute,
            avg_latency_ms=excluded.avg_latency_ms,
            p95_latency_ms=excluded.p95_latency_ms
        """,
        (
            run_id,
            attempted_responses,
            accepted_gold_rows,
            parse_failure_rate,
            illegal_rate,
            responses_per_minute,
            avg_latency_ms,
            p95_latency_ms,
        ),
    )
