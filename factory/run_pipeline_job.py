from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def write_summary(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a full factory pipeline job.")
    parser.add_argument("--job-id", required=True, help="Stable job identifier.")
    parser.add_argument("--output-dir", type=Path, required=True, help="Per-job output directory.")
    parser.add_argument(
        "--max-scenarios",
        type=int,
        default=10,
        help="Scenario count to generate.",
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
        "--include-forced",
        action="store_true",
        help="Include states with only one legal move.",
    )
    return parser.parse_args()


def main() -> None:
    from factory.common import ensure_output_dir, write_jsonl
    from factory.filter_gold_data import validate_row
    from factory.gen_scenarios import collect_scenarios
    from factory.generate_trajectories import process_scenarios

    args = parse_args()
    output_root = PROJECT_ROOT / "factory" / "output"
    job_dir = ensure_output_dir(args.output_dir)
    summary_path = job_dir / "job_summary.json"
    scenarios_path = job_dir / "scenarios.jsonl"
    raw_path = job_dir / "raw_responses.jsonl"
    gold_path = job_dir / "gold_dataset.jsonl"
    rejected_path = job_dir / "rejected_responses.jsonl"
    started = time.perf_counter()

    summary: dict[str, Any] = {
        "job_id": args.job_id,
        "status": "running",
        "started_at": utc_now(),
        "ended_at": None,
        "config": {
            "max_scenarios": args.max_scenarios,
            "seed": args.seed,
            "winning_score": args.winning_score,
            "model": args.model,
            "host": args.host,
            "timeout": args.timeout,
            "retries": args.retries,
            "concurrency": args.concurrency,
            "include_forced": args.include_forced,
        },
        "paths": {
            "scenarios": str(scenarios_path.relative_to(output_root)).replace("\\", "/"),
            "raw_responses": str(raw_path.relative_to(output_root)).replace("\\", "/"),
            "gold_dataset": str(gold_path.relative_to(output_root)).replace("\\", "/"),
            "rejected_responses": str(rejected_path.relative_to(output_root)).replace("\\", "/"),
        },
        "counts": {},
        "error": None,
    }
    write_summary(summary_path, summary)

    try:
        print(f"[{args.job_id}] Generating {args.max_scenarios} scenarios.")
        scenarios, scenario_stats = collect_scenarios(
            seed=args.seed,
            max_scenarios=args.max_scenarios,
            winning_score=args.winning_score,
            include_forced=args.include_forced,
        )
        write_jsonl(scenarios_path, scenarios)
        print(f"[{args.job_id}] Wrote scenarios to {scenarios_path}.")

        print(f"[{args.job_id}] Querying Ollama model {args.model}.")
        raw_rows = process_scenarios(
            scenarios=scenarios,
            model=args.model,
            host=args.host,
            timeout_s=args.timeout,
            retries=args.retries,
            concurrency=args.concurrency,
        )
        write_jsonl(raw_path, raw_rows)
        parse_failures = sum(1 for row in raw_rows if row["parse_error"] is not None)
        print(
            f"[{args.job_id}] Wrote raw responses to {raw_path}. "
            f"Parse failures: {parse_failures}."
        )

        gold_rows: list[dict[str, Any]] = []
        rejected_rows: list[dict[str, Any]] = []
        for row in raw_rows:
            gold, rejected = validate_row(row)
            if gold is not None:
                gold_rows.append(gold)
            if rejected is not None:
                rejected_rows.append(rejected)
        write_jsonl(gold_path, gold_rows)
        write_jsonl(rejected_path, rejected_rows)
        print(
            f"[{args.job_id}] Validation complete. "
            f"Gold: {len(gold_rows)} Rejected: {len(rejected_rows)}."
        )

        summary["status"] = "completed"
        summary["counts"] = {
            "scenarios": len(scenarios),
            "candidate_turns": scenario_stats["candidate_turns"],
            "skipped_forced_moves": scenario_stats["skipped_forced_moves"],
            "raw_responses": len(raw_rows),
            "gold_rows": len(gold_rows),
            "rejected_rows": len(rejected_rows),
            "parse_failures": parse_failures,
        }
    except Exception as exc:
        summary["status"] = "failed"
        summary["error"] = str(exc)
        print(f"[{args.job_id}] Job failed: {exc}", file=sys.stderr)
        raise
    finally:
        summary["ended_at"] = utc_now()
        summary["duration_seconds"] = round(time.perf_counter() - started, 2)
        write_summary(summary_path, summary)


if __name__ == "__main__":
    main()
