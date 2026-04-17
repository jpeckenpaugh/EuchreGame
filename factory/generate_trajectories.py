from __future__ import annotations

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def parse_model_response(text: str) -> tuple[dict[str, Any] | None, str | None]:
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        return None, f"invalid_json:{exc}"
    if not isinstance(parsed, dict):
        return None, "response_was_not_object"
    reasoning = parsed.get("reasoning")
    move = parsed.get("move")
    if not isinstance(reasoning, str) or not isinstance(move, str):
        return None, "missing_reasoning_or_move"
    return {"reasoning": reasoning.strip(), "move": move.strip()}, None


def process_scenarios(
    *,
    scenarios: list[dict[str, Any]],
    model: str,
    host: str,
    timeout_s: float,
    retries: int,
    concurrency: int = 1,
) -> list[dict[str, Any]]:
    from factory.common import (
        PROMPT_VERSION,
        build_teacher_prompt,
        compact_state_from_masked_state,
        ollama_generate,
    )

    def process_one(scenario: dict[str, Any]) -> dict[str, Any]:
        compact_state = compact_state_from_masked_state(scenario["masked_state"])
        prompt = build_teacher_prompt(compact_state, list(scenario["legal_move_tokens"]))
        base_row = {
            "scenario": scenario,
            "model": model,
            "prompt_version": PROMPT_VERSION,
            "compact_state": compact_state,
            "prompt": prompt,
        }
        try:
            response = ollama_generate(
                model=model,
                prompt=prompt,
                host=host,
                timeout_s=timeout_s,
                retries=retries,
            )
            model_text = str(response.get("response", ""))
            parsed_response, parse_error = parse_model_response(model_text)
            return {
                **base_row,
                "raw_response_text": model_text,
                "ollama_response": response,
                "parsed_response": parsed_response,
                "parse_error": parse_error,
                "transport_error": None,
            }
        except Exception as exc:
            return {
                **base_row,
                "raw_response_text": "",
                "ollama_response": None,
                "parsed_response": None,
                "parse_error": "transport_error",
                "transport_error": str(exc),
            }

    if concurrency <= 1:
        return [process_one(scenario) for scenario in scenarios]

    rows: list[dict[str, Any] | None] = [None] * len(scenarios)
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = {
            executor.submit(process_one, scenario): index
            for index, scenario in enumerate(scenarios)
        }
        for future in as_completed(futures):
            rows[futures[future]] = future.result()

    return [row for row in rows if row is not None]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate teacher trajectories via Ollama.")
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("factory/output/scenarios.jsonl"),
        help="Scenario JSONL path.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("factory/output/raw_responses.jsonl"),
        help="Raw response JSONL path.",
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
        default=120.0,
        help="Per-request timeout in seconds.",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=2,
        help="Retry count for transient failures.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional number of scenarios to process.",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=1,
        help="Number of concurrent inference workers.",
    )
    return parser.parse_args()


def main() -> None:
    from factory.common import append_jsonl, ensure_output_dir, read_jsonl

    args = parse_args()
    ensure_output_dir(args.output.parent)
    scenarios = read_jsonl(args.input)
    if args.limit is not None:
        scenarios = scenarios[: args.limit]
    if not scenarios:
        raise SystemExit(f"No scenarios found in {args.input}")

    rows = process_scenarios(
        scenarios=scenarios,
        model=args.model,
        host=args.host,
        timeout_s=args.timeout,
        retries=args.retries,
        concurrency=args.concurrency,
    )

    if args.output.exists():
        args.output.unlink()
    for row in rows:
        append_jsonl(args.output, row)

    parse_failures = sum(1 for row in rows if row["parse_error"] is not None)
    print(f"Wrote {len(rows)} responses to {args.output}")
    print(f"Parse failures: {parse_failures}")


if __name__ == "__main__":
    main()
