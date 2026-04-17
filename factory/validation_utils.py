from __future__ import annotations

from typing import Any


def validate_with_status(
    row: dict[str, Any],
) -> tuple[dict[str, Any] | None, dict[str, Any] | None, dict[str, Any]]:
    from factory.common import reasoning_word_count
    from factory.filter_gold_data import validate_row

    scenario = dict(row["scenario"])
    parsed_response = row.get("parsed_response")
    transport_error = row.get("transport_error")
    gold_row, rejected = validate_row(row)

    if transport_error:
        failure_bucket = "transport_error"
    elif row.get("parse_error"):
        failure_bucket = str(row["parse_error"])
    elif rejected is not None:
        failure_bucket = str(rejected.get("reason", "rejected"))
    else:
        failure_bucket = None

    reasoning = ""
    output_move = None
    if isinstance(parsed_response, dict):
        reasoning = str(parsed_response.get("reasoning", ""))
        output_move = parsed_response.get("move")

    latency_ms = None
    backend_response = row.get("backend_response")
    if isinstance(backend_response, dict):
        latency_ms = backend_response.get("latency_ms")

    validated = {
        "session_id": scenario["session_id"],
        "hand_id": scenario["hand_id"],
        "turn_id": scenario["turn_id"],
        "viewer_seat": scenario["viewer_seat"],
        "phase": scenario.get("phase") or scenario["masked_state"]["phase"],
        "legal_move_count": scenario.get("legal_move_count", len(scenario["legal_move_tokens"])),
        "legal_move_tokens": list(scenario["legal_move_tokens"]),
        "model": row.get("model"),
        "api_style": row.get("api_style"),
        "prompt_version": row.get("prompt_version"),
        "latency_ms": latency_ms,
        "parse_ok": row.get("parse_error") is None and transport_error is None,
        "legal_ok": rejected is None and failure_bucket is None,
        "accepted": gold_row is not None,
        "failure_bucket": failure_bucket,
        "transport_error": transport_error,
        "reasoning_word_count": reasoning_word_count(reasoning),
        "output_move": output_move,
        "compact_state": row.get("compact_state"),
    }
    rejected_row = None
    if rejected is not None:
        validated["rejection_detail"] = rejected
        rejected_row = {
            "failure_bucket": failure_bucket,
            "scenario": scenario,
            "parsed_response": parsed_response,
            "parse_error": row.get("parse_error"),
            "transport_error": transport_error,
            "rejection_detail": rejected,
            "compact_state": row.get("compact_state"),
            "model": row.get("model"),
            "api_style": row.get("api_style"),
            "prompt_version": row.get("prompt_version"),
        }
    return gold_row, rejected_row, validated
