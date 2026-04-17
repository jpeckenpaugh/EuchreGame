from __future__ import annotations

import argparse
import json
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


def write_summary(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, round((pct / 100) * (len(ordered) - 1))))
    return ordered[index]


def validate_with_status(
    row: dict[str, Any],
) -> tuple[dict[str, Any] | None, dict[str, Any] | None, dict[str, Any]]:
    from factory.validation_utils import validate_with_status as _validate_with_status

    return _validate_with_status(row)


def summarize_validated_rows(
    *,
    validated_rows: list[dict[str, Any]],
    scenario_stats: dict[str, int],
    wall_time_s: float,
) -> dict[str, Any]:
    accepted = [row for row in validated_rows if row["accepted"]]
    parse_ok = [row for row in validated_rows if row["parse_ok"]]
    legal_ok = [row for row in validated_rows if row["legal_ok"]]
    latencies = [
        float(row["latency_ms"])
        for row in validated_rows
        if isinstance(row.get("latency_ms"), (int, float))
    ]
    phase_breakdown: dict[str, dict[str, int]] = {}
    failure_buckets: dict[str, int] = {}
    for row in validated_rows:
        phase = str(row["phase"])
        phase_breakdown.setdefault(phase, {"attempted": 0, "accepted": 0})
        phase_breakdown[phase]["attempted"] += 1
        if row["accepted"]:
            phase_breakdown[phase]["accepted"] += 1

        failure_bucket = row.get("failure_bucket")
        if failure_bucket:
            failure_buckets[str(failure_bucket)] = failure_buckets.get(str(failure_bucket), 0) + 1

    attempted = len(validated_rows)
    return {
        "attempted_responses": attempted,
        "accepted_gold_rows": len(accepted),
        "parse_valid_count": len(parse_ok),
        "legal_valid_count": len(legal_ok),
        "acceptance_rate": round((len(accepted) / attempted) * 100, 2) if attempted else 0.0,
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
        "scenario_stats": scenario_stats,
        "phase_breakdown": phase_breakdown,
        "failure_buckets": failure_buckets,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark Euchre teacher generation.")
    parser.add_argument(
        "--target-responses",
        type=int,
        default=1000,
        help="Number of decision responses to attempt.",
    )
    parser.add_argument("--seed", type=int, default=7, help="Base RNG seed.")
    parser.add_argument(
        "--winning-score",
        type=int,
        default=10,
        help="Winning score for simulations.",
    )
    parser.add_argument("--model", default="gemma4:latest", help="Ollama model name.")
    parser.add_argument(
        "--host",
        default="http://127.0.0.1:11434",
        help="Base Ollama API URL.",
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
        "--concurrency",
        type=int,
        default=1,
        help="Number of concurrent inference workers.",
    )
    parser.add_argument(
        "--api-style",
        choices=("ollama", "openai"),
        default="ollama",
        help="Backend API style.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Benchmark output directory. Defaults under factory/output/benchmarks.",
    )
    return parser.parse_args()


def main() -> None:
    from factory.common import PROMPT_VERSION, ensure_output_dir, write_jsonl
    from factory.gen_scenarios import collect_scenarios
    from factory.generate_trajectories import process_scenarios

    args = parse_args()
    benchmark_id = datetime.now(UTC).strftime("benchmark-%Y%m%d-%H%M%S")
    output_dir = args.output_dir or (
        PROJECT_ROOT / "factory" / "output" / "benchmarks" / benchmark_id
    )
    benchmark_dir_input = output_dir if output_dir.is_absolute() else PROJECT_ROOT / output_dir
    benchmark_dir = ensure_output_dir(benchmark_dir_input)
    started_at = utc_now()
    started = time.perf_counter()

    scenarios_path = benchmark_dir / "scenarios.jsonl"
    raw_path = benchmark_dir / "raw_responses.jsonl"
    validated_path = benchmark_dir / "validated_rows.jsonl"
    gold_path = benchmark_dir / "gold_dataset.jsonl"
    rejected_path = benchmark_dir / "rejected_rows.jsonl"
    summary_path = benchmark_dir / "benchmark_summary.json"

    print(
        f"[{benchmark_id}] Collecting {args.target_responses} decision states "
        f"(forced moves skipped)."
    )
    scenarios, scenario_stats = collect_scenarios(
        seed=args.seed,
        max_scenarios=args.target_responses,
        winning_score=args.winning_score,
        include_forced=False,
    )
    write_jsonl(scenarios_path, scenarios)
    print(
        f"[{benchmark_id}] Collected {len(scenarios)} decision states "
        f"from {scenario_stats['candidate_turns']} candidate turns."
    )

    print(
        f"[{benchmark_id}] Running teacher inference with concurrency={args.concurrency} "
        f"using {args.model}."
    )
    raw_rows = process_scenarios(
        scenarios=scenarios,
        model=args.model,
        host=args.host,
        timeout_s=args.timeout,
        retries=args.retries,
        concurrency=args.concurrency,
        api_style=args.api_style,
    )
    write_jsonl(raw_path, raw_rows)

    gold_rows: list[dict[str, Any]] = []
    rejected_rows: list[dict[str, Any]] = []
    validated_rows: list[dict[str, Any]] = []
    for row in raw_rows:
        gold_row, rejected_row, validated = validate_with_status(row)
        validated_rows.append(validated)
        if gold_row is not None:
            gold_rows.append(gold_row)
        if rejected_row is not None:
            rejected_rows.append(rejected_row)

    write_jsonl(validated_path, validated_rows)
    write_jsonl(gold_path, gold_rows)
    write_jsonl(rejected_path, rejected_rows)

    wall_time_s = time.perf_counter() - started
    summary = {
        "benchmark_id": benchmark_id,
        "started_at": started_at,
        "ended_at": utc_now(),
        "config": {
            "target_responses": args.target_responses,
            "seed": args.seed,
            "winning_score": args.winning_score,
            "model": args.model,
            "host": args.host,
            "timeout": args.timeout,
            "retries": args.retries,
            "concurrency": args.concurrency,
            "api_style": args.api_style,
            "include_forced": False,
            "prompt_version": PROMPT_VERSION,
        },
        "paths": {
            "scenarios": str(scenarios_path.relative_to(PROJECT_ROOT)).replace("\\", "/"),
            "raw_responses": str(raw_path.relative_to(PROJECT_ROOT)).replace("\\", "/"),
            "validated_rows": str(validated_path.relative_to(PROJECT_ROOT)).replace("\\", "/"),
            "gold_dataset": str(gold_path.relative_to(PROJECT_ROOT)).replace("\\", "/"),
            "rejected_rows": str(rejected_path.relative_to(PROJECT_ROOT)).replace("\\", "/"),
        },
        "metrics": summarize_validated_rows(
            validated_rows=validated_rows,
            scenario_stats=scenario_stats,
            wall_time_s=wall_time_s,
        ),
    }
    write_summary(summary_path, summary)

    print(f"[{benchmark_id}] Benchmark complete.")
    print(json.dumps(summary["metrics"], indent=2))


if __name__ == "__main__":
    main()
