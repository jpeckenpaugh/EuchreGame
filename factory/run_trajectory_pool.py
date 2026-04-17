from __future__ import annotations

import argparse
import json
import random
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from statistics import mean
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, round((pct / 100) * (len(ordered) - 1))))
    return ordered[index]


def parse_backend_spec(spec: str) -> dict[str, Any]:
    parts = spec.split("|")
    if len(parts) != 5:
        raise argparse.ArgumentTypeError(
            "Backend spec must look like name|api_style|host|model|weight"
        )
    name, api_style, host, model, weight_text = [part.strip() for part in parts]
    if api_style not in {"ollama", "openai"}:
        raise argparse.ArgumentTypeError("api_style must be ollama or openai")
    weight = float(weight_text)
    backend_id = name.lower().replace(" ", "-")
    return {
        "backend_id": backend_id,
        "name": name,
        "api_style": api_style,
        "host": host,
        "model": model,
        "weight": weight,
    }


def choose_backend(backends: list[dict[str, Any]], rng: random.Random) -> dict[str, Any]:
    weights = [float(max(0.0, backend["weight"])) for backend in backends]
    total = sum(weights)
    if total <= 0:
        return backends[0]
    threshold = rng.random() * total
    running = 0.0
    for backend, weight in zip(backends, weights, strict=True):
        running += weight
        if threshold <= running:
            return backend
    return backends[-1]


def build_scenario(
    *,
    game: Any,
    game_id: str,
    seed: int,
    turn_index: int,
) -> dict[str, Any]:
    from factory.common import move_to_token

    active_player = game.current_player
    if active_player is None:
        raise RuntimeError("Expected active player while building a scenario.")
    masked_state = game.get_masked_state(active_player)
    legal_moves = [dict(move) for move in game.get_legal_moves()]
    legal_move_tokens = [move_to_token(move) for move in legal_moves]
    return {
        "session_id": game_id,
        "hand_id": game.hand_number,
        "turn_id": turn_index,
        "viewer_seat": active_player,
        "seed": seed,
        "engine_state": game.to_dict(),
        "masked_state": masked_state,
        "legal_moves": legal_moves,
        "legal_move_tokens": legal_move_tokens,
        "phase": str(masked_state["phase"]),
        "legal_move_count": len(legal_move_tokens),
    }


def summarize_run(
    *,
    validated_rows: list[dict[str, Any]],
    backend_stats: dict[str, dict[str, Any]],
    wall_time_s: float,
    total_candidate_turns: int,
    total_decision_turns: int,
    total_skipped_forced: int,
) -> dict[str, Any]:
    accepted = [row for row in validated_rows if row["accepted"]]
    parse_ok = [row for row in validated_rows if row["parse_ok"]]
    legal_ok = [row for row in validated_rows if row["legal_ok"]]
    latencies = [
        float(row["latency_ms"])
        for row in validated_rows
        if isinstance(row.get("latency_ms"), (int, float))
    ]
    attempted = len(validated_rows)
    backend_summary: dict[str, dict[str, Any]] = {}
    for backend_id, stats in backend_stats.items():
        backend_latencies = stats["latencies"]
        backend_summary[backend_id] = {
            "name": stats["name"],
            "model": stats["model"],
            "api_style": stats["api_style"],
            "games": stats["games"],
            "attempted_turns": stats["attempted_turns"],
            "accepted_turns": stats["accepted_turns"],
            "avg_latency_ms": round(mean(backend_latencies), 2) if backend_latencies else None,
        }

    return {
        "attempted_responses": attempted,
        "accepted_gold_rows": len(accepted),
        "parse_failure_rate": round(((attempted - len(parse_ok)) / attempted) * 100, 2)
        if attempted
        else 0.0,
        "illegal_or_rejected_rate": round(((attempted - len(legal_ok)) / attempted) * 100, 2)
        if attempted
        else 0.0,
        "responses_per_minute": round((attempted / wall_time_s) * 60, 2) if wall_time_s else 0.0,
        "wall_time_seconds": round(wall_time_s, 2),
        "latency_ms": {
            "avg": round(mean(latencies), 2) if latencies else None,
            "p95": round(percentile(latencies, 95) or 0.0, 2) if latencies else None,
            "max": round(max(latencies), 2) if latencies else None,
        },
        "trajectory_stats": {
            "candidate_turns": total_candidate_turns,
            "decision_turns": total_decision_turns,
            "skipped_forced_turns": total_skipped_forced,
        },
        "backends": backend_summary,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run pooled single-backend-per-game trajectories across teacher backends."
    )
    parser.add_argument("--games", type=int, default=10, help="Number of hands to play.")
    parser.add_argument("--seed", type=int, default=7, help="Base RNG seed.")
    parser.add_argument(
        "--winning-score",
        type=int,
        default=10,
        help="Winning score passed to the engine for each hand.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=180.0,
        help="Per-request timeout in seconds.",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=2,
        help="Retry count for transient failures.",
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=Path("factory/output/factory.db"),
        help="SQLite tracking database path.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Run output directory. Defaults under factory/output/runs.",
    )
    parser.add_argument(
        "--backend",
        action="append",
        required=True,
        help="Backend spec: name|api_style|host|model|weight",
    )
    return parser.parse_args()


def main() -> None:
    from euchre_game import EuchreGame, Phase
    from factory.common import PROMPT_VERSION, ensure_output_dir, write_jsonl
    from factory.db import (
        create_game,
        create_run,
        finish_game,
        finish_run,
        open_db,
        register_artifact,
        register_run_backend,
        start_run,
        update_run_backend_metrics,
        upsert_backend,
        upsert_run_metrics,
    )
    from factory.generate_trajectories import process_scenario
    from factory.validation_utils import validate_with_status

    args = parse_args()
    backends = [parse_backend_spec(spec) for spec in args.backend]
    run_id = datetime.now(UTC).strftime("trajectory-%Y%m%d-%H%M%S")
    run_dir = args.output_dir or (PROJECT_ROOT / "factory" / "output" / "runs" / run_id)
    run_dir = run_dir if run_dir.is_absolute() else PROJECT_ROOT / run_dir
    ensure_output_dir(run_dir)
    db_dir = (
        args.db_path.parent
        if args.db_path.is_absolute()
        else PROJECT_ROOT / args.db_path.parent
    )
    ensure_output_dir(db_dir)
    db_path = args.db_path if args.db_path.is_absolute() else PROJECT_ROOT / args.db_path
    rng = random.Random(args.seed)

    trajectory_path = run_dir / "trajectory.jsonl"
    raw_path = run_dir / "raw_responses.jsonl"
    validated_path = run_dir / "validated_rows.jsonl"
    gold_path = run_dir / "gold_dataset.jsonl"
    rejected_path = run_dir / "rejected_rows.jsonl"
    manifest_path = run_dir / "run_manifest.json"

    trajectory_rows: list[dict[str, Any]] = []
    raw_rows: list[dict[str, Any]] = []
    validated_rows: list[dict[str, Any]] = []
    gold_rows: list[dict[str, Any]] = []
    rejected_rows: list[dict[str, Any]] = []
    total_candidate_turns = 0
    total_decision_turns = 0
    total_skipped_forced = 0
    started_at = utc_now()
    started = time.perf_counter()

    backend_stats = {
        backend["backend_id"]: {
            "name": backend["name"],
            "model": backend["model"],
            "api_style": backend["api_style"],
            "games": 0,
            "attempted_turns": 0,
            "accepted_turns": 0,
            "latencies": [],
        }
        for backend in backends
    }

    with open_db(db_path) as connection:
        create_run(
            connection,
            run_id=run_id,
            created_at=started_at,
            mode="trajectory_pool",
            prompt_version=PROMPT_VERSION,
            notes="single backend per game trajectory run",
        )
        start_run(connection, run_id=run_id, started_at=started_at)
        for backend in backends:
            upsert_backend(connection, backend, seen_at=started_at)
            register_run_backend(connection, run_id=run_id, backend_id=backend["backend_id"])

        for game_number in range(args.games):
            game_seed = rng.randrange(1, 10_000_000)
            dealer = rng.randrange(4)
            game_id = f"{run_id}-g{game_number + 1:03d}"
            backend = choose_backend(backends, rng)
            backend_stats[backend["backend_id"]]["games"] += 1
            create_game(
                connection,
                game_id=game_id,
                run_id=run_id,
                backend_id=backend["backend_id"],
                seed=game_seed,
                started_at=utc_now(),
            )

            game = EuchreGame.new_game(
                seed=game_seed,
                dealer=dealer,
                winning_score=args.winning_score,
            )
            turn_index = 0
            game_candidate_turns = 0
            game_decision_turns = 0
            game_skipped_forced = 0
            game_accepted_turns = 0

            while game.phase != Phase.HAND_COMPLETE:
                legal_moves = [dict(move) for move in game.get_legal_moves()]
                if not legal_moves:
                    raise RuntimeError(
                        f"No legal moves available for {game_id} in phase {game.phase!r}"
                    )

                game_candidate_turns += 1
                total_candidate_turns += 1

                if len(legal_moves) == 1:
                    game_skipped_forced += 1
                    total_skipped_forced += 1
                    game.apply_move(legal_moves[0])
                    turn_index += 1
                    continue

                scenario = build_scenario(
                    game=game,
                    game_id=game_id,
                    seed=game_seed,
                    turn_index=turn_index,
                )
                raw_row = process_scenario(
                    scenario=scenario,
                    model=backend["model"],
                    host=backend["host"],
                    timeout_s=args.timeout,
                    retries=args.retries,
                    api_style=backend["api_style"],
                )
                raw_row["backend_id"] = backend["backend_id"]
                raw_row["backend_name"] = backend["name"]
                raw_row["game_id"] = game_id
                raw_rows.append(raw_row)

                gold_row, rejected_row, validated = validate_with_status(raw_row)
                validated["backend_id"] = backend["backend_id"]
                validated["backend_name"] = backend["name"]
                validated["game_id"] = game_id
                validated_rows.append(validated)

                latency_ms = validated.get("latency_ms")
                if isinstance(latency_ms, (int, float)):
                    backend_stats[backend["backend_id"]]["latencies"].append(float(latency_ms))
                backend_stats[backend["backend_id"]]["attempted_turns"] += 1

                if gold_row is not None:
                    gold_row["metadata"]["backend_id"] = backend["backend_id"]
                    gold_row["metadata"]["backend_name"] = backend["name"]
                    gold_row["metadata"]["api_style"] = backend["api_style"]
                    gold_row["metadata"]["game_id"] = game_id
                    gold_rows.append(gold_row)
                    game_accepted_turns += 1
                    backend_stats[backend["backend_id"]]["accepted_turns"] += 1
                if rejected_row is not None:
                    rejected_row["backend_id"] = backend["backend_id"]
                    rejected_row["backend_name"] = backend["name"]
                    rejected_row["game_id"] = game_id
                    rejected_rows.append(rejected_row)

                trajectory_rows.append(
                    {
                        "run_id": run_id,
                        "game_id": game_id,
                        "turn_index": turn_index,
                        "seed": game_seed,
                        "backend_id": backend["backend_id"],
                        "backend_name": backend["name"],
                        "backend_model": backend["model"],
                        "api_style": backend["api_style"],
                        "scenario": scenario,
                        "raw_response": raw_row,
                        "validated": validated,
                    }
                )

                game_decision_turns += 1
                total_decision_turns += 1

                if gold_row is not None:
                    move_token = str(gold_row["output"]).replace('{"move":"', "").replace('"}', "")
                    move_lookup = {
                        token: move
                        for token, move in zip(
                            scenario["legal_move_tokens"],
                            scenario["legal_moves"],
                            strict=True,
                        )
                    }
                    chosen_move = move_lookup.get(move_token)
                    if chosen_move is None:
                        raise RuntimeError(
                            f"Accepted move token {move_token!r} was not recoverable."
                        )
                    game.apply_move(chosen_move)
                else:
                    game.apply_move(legal_moves[0])

                turn_index += 1

            finish_game(
                connection,
                game_id=game_id,
                ended_at=utc_now(),
                status="completed",
                candidate_turns=game_candidate_turns,
                decision_turns=game_decision_turns,
                skipped_forced_turns=game_skipped_forced,
                accepted_turns=game_accepted_turns,
            )

        wall_time_s = time.perf_counter() - started
        write_jsonl(trajectory_path, trajectory_rows)
        write_jsonl(raw_path, raw_rows)
        write_jsonl(validated_path, validated_rows)
        write_jsonl(gold_path, gold_rows)
        write_jsonl(rejected_path, rejected_rows)

        summary = summarize_run(
            validated_rows=validated_rows,
            backend_stats=backend_stats,
            wall_time_s=wall_time_s,
            total_candidate_turns=total_candidate_turns,
            total_decision_turns=total_decision_turns,
            total_skipped_forced=total_skipped_forced,
        )
        manifest = {
            "run_id": run_id,
            "started_at": started_at,
            "ended_at": utc_now(),
            "config": {
                "games": args.games,
                "seed": args.seed,
                "winning_score": args.winning_score,
                "timeout": args.timeout,
                "retries": args.retries,
                "prompt_version": PROMPT_VERSION,
                "backends": backends,
            },
            "paths": {
                "trajectory": str(trajectory_path.relative_to(PROJECT_ROOT)).replace("\\", "/"),
                "raw_responses": str(raw_path.relative_to(PROJECT_ROOT)).replace("\\", "/"),
                "validated_rows": str(validated_path.relative_to(PROJECT_ROOT)).replace("\\", "/"),
                "gold_dataset": str(gold_path.relative_to(PROJECT_ROOT)).replace("\\", "/"),
                "rejected_rows": str(rejected_path.relative_to(PROJECT_ROOT)).replace("\\", "/"),
            },
            "summary": summary,
        }
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        for backend_id, stats in backend_stats.items():
            avg_latency_ms = round(mean(stats["latencies"]), 2) if stats["latencies"] else None
            update_run_backend_metrics(
                connection,
                run_id=run_id,
                backend_id=backend_id,
                attempted_turns=stats["attempted_turns"],
                accepted_turns=stats["accepted_turns"],
                avg_latency_ms=avg_latency_ms,
            )

        upsert_run_metrics(
            connection,
            run_id=run_id,
            attempted_responses=summary["attempted_responses"],
            accepted_gold_rows=summary["accepted_gold_rows"],
            parse_failure_rate=summary["parse_failure_rate"],
            illegal_rate=summary["illegal_or_rejected_rate"],
            responses_per_minute=summary["responses_per_minute"],
            avg_latency_ms=summary["latency_ms"]["avg"],
            p95_latency_ms=summary["latency_ms"]["p95"],
        )

        for kind, path in (
            ("trajectory", trajectory_path),
            ("raw_responses", raw_path),
            ("validated_rows", validated_path),
            ("gold_dataset", gold_path),
            ("rejected_rows", rejected_path),
        ):
            row_count = sum(1 for _ in path.open("r", encoding="utf-8") if _.strip())
            register_artifact(
                connection,
                run_id=run_id,
                game_id=None,
                kind=kind,
                path=str(path.relative_to(PROJECT_ROOT)).replace("\\", "/"),
                row_count=row_count,
                size_bytes=path.stat().st_size,
            )

        register_artifact(
            connection,
            run_id=run_id,
            game_id=None,
            kind="run_manifest",
            path=str(manifest_path.relative_to(PROJECT_ROOT)).replace("\\", "/"),
            row_count=None,
            size_bytes=manifest_path.stat().st_size,
        )
        finish_run(connection, run_id=run_id, ended_at=utc_now(), status="completed")

    print(json.dumps(manifest["summary"], indent=2))


if __name__ == "__main__":
    main()
