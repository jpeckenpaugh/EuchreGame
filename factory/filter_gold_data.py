from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def validate_row(row: dict[str, Any]) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    from factory.common import (
        build_instruction,
        compact_state_from_masked_state,
        move_to_token,
        normalize_move_token,
        rebuild_game,
    )

    scenario = dict(row["scenario"])
    parsed_response = row.get("parsed_response")
    compact_state = row.get("compact_state") or compact_state_from_masked_state(
        scenario["masked_state"]
    )

    if not isinstance(parsed_response, dict):
        return None, {"reason": row.get("parse_error") or "missing_parsed_response", "row": row}

    proposed_move = normalize_move_token(str(parsed_response.get("move", "")))
    game = rebuild_game(scenario["engine_state"])
    legal_moves = [dict(move) for move in game.get_legal_moves()]
    legal_lookup = {move_to_token(move): move for move in legal_moves}

    chosen_move = legal_lookup.get(proposed_move)
    if chosen_move is None:
        return None, {
            "reason": "illegal_move",
            "proposed_move": proposed_move,
            "legal_move_tokens": list(legal_lookup.keys()),
            "row": row,
        }

    gold = {
        "instruction": build_instruction(compact_state),
        "thought": str(parsed_response["reasoning"]),
        "output": '{"move":"' + proposed_move + '"}',
        "metadata": {
            "session_id": scenario["session_id"],
            "hand_id": scenario["hand_id"],
            "turn_id": scenario["turn_id"],
            "viewer_seat": scenario["viewer_seat"],
            "model": row.get("model"),
        },
    }
    return gold, None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Filter raw Ollama responses into a gold dataset.")
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("factory/output/raw_responses.jsonl"),
        help="Raw response JSONL path.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("factory/output/gold_dataset.jsonl"),
        help="Gold dataset JSONL path.",
    )
    parser.add_argument(
        "--failures",
        type=Path,
        default=Path("factory/output/rejected_responses.jsonl"),
        help="Rejected samples JSONL path.",
    )
    return parser.parse_args()


def main() -> None:
    from factory.common import append_jsonl, ensure_output_dir, read_jsonl

    args = parse_args()
    ensure_output_dir(args.output.parent)
    rows = read_jsonl(args.input)
    if not rows:
        raise SystemExit(f"No raw responses found in {args.input}")

    gold_rows: list[dict[str, Any]] = []
    rejected_rows: list[dict[str, Any]] = []
    for row in rows:
        gold, rejected = validate_row(row)
        if gold is not None:
            gold_rows.append(gold)
        if rejected is not None:
            rejected_rows.append(rejected)

    if args.output.exists():
        args.output.unlink()
    if args.failures.exists():
        args.failures.unlink()
    for row in gold_rows:
        append_jsonl(args.output, row)
    for row in rejected_rows:
        append_jsonl(args.failures, row)

    total = len(rows)
    accepted = len(gold_rows)
    rejected = len(rejected_rows)
    accepted_rate = (accepted / total) * 100 if total else 0.0
    print(f"Wrote {accepted} gold rows to {args.output}")
    print(f"Wrote {rejected} rejected rows to {args.failures}")
    print(f"Accepted rate: {accepted_rate:.1f}%")


if __name__ == "__main__":
    main()
