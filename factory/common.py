from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from euchre_game import EuchreGame

OUTPUT_DIR = Path("factory/output")
PROMPT_VERSION = "v2-grounded-short"
SYSTEM_PROMPT = (
    "You are a professional Euchre expert generating supervised training data. "
    "Your job is to choose exactly one legal move and explain the choice using only facts that "
    "follow from the provided masked state. "
    "Do not invent hidden cards, prior actions, or future outcomes. "
    "If the state is ambiguous, say so briefly and still choose the best legal move. "
    "You must respond ONLY in JSON. Do not provide introductory or concluding text."
)


def ensure_output_dir(path: Path | None = None) -> Path:
    output_dir = path or OUTPUT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


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


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, separators=(",", ":")))
            handle.write("\n")


def append_jsonl(path: Path, row: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(row, separators=(",", ":")))
        handle.write("\n")


def move_to_token(move: dict[str, Any]) -> str:
    move_type = str(move["type"])
    if move_type == "pass":
        return "PASS"
    if move_type == "order_up":
        return "ORDER_UP"
    if move_type == "call_trump":
        return f"CALL_{str(move['suit']).upper()}"
    if move_type in {"discard", "play_card"}:
        return normalize_card_token(str(move["card"]))
    return move_type.upper()


def normalize_card_token(card: str) -> str:
    return card.strip().upper().replace("10", "T")


def normalize_move_token(token: str) -> str:
    normalized = token.strip().upper().replace(" ", "_")
    if normalized.startswith("CALL:"):
        normalized = normalized.replace(":", "_", 1)
    return normalized.replace("10", "T")


def compact_state_from_masked_state(masked_state: dict[str, Any]) -> str:
    viewer_seat = int(masked_state["viewer_seat"])
    hand = [str(card) for card in masked_state["hands"][str(viewer_seat)]]
    legal_moves = [move_to_token(move) for move in masked_state.get("legal_moves", [])]
    lead = "-"
    current_trick = list(masked_state.get("current_trick", []))
    if current_trick:
        lead = normalize_card_token(str(current_trick[0]["card"]))

    trump = str(masked_state.get("trump") or "-")
    upcard = str(masked_state.get("upcard") or "-")
    score_map = masked_state.get("scores", {})
    trick_map = masked_state.get("tricks_won", {})
    score_text = f"{int(score_map.get('0', 0))}-{int(score_map.get('1', 0))}"
    trick_text = f"{int(trick_map.get('0', 0))}-{int(trick_map.get('1', 0))}"

    return " | ".join(
        [
            f"Ph:{masked_state['phase']}",
            f"T:{trump}",
            f"P:{viewer_seat}",
            f"D:{int(masked_state['dealer'])}",
            f"U:{normalize_card_token(upcard) if upcard != '-' else '-'}",
            f"L:{lead}",
            f"Sc:[{score_text}]",
            f"Tr:[{trick_text}]",
            f"H:[{','.join(normalize_card_token(card) for card in hand)}]",
            f"Leg:[{','.join(legal_moves)}]",
        ]
    )


def build_instruction(compact_state: str) -> str:
    return f"You are a Euchre Expert. State: {compact_state}"


def reasoning_word_count(text: str) -> int:
    return len([part for part in text.strip().split() if part])


def build_teacher_prompt(compact_state: str, legal_tokens: list[str]) -> str:
    legal_text = ", ".join(legal_tokens)
    user_prompt = (
        "Analyze the masked Euchre state for the acting player and choose the best legal move.\n"
        f"State: {compact_state}\n"
        f"Legal move tokens: {legal_text}\n"
        "Rules for reasoning:\n"
        "- Use only information visible in the provided state.\n"
        "- Mention specific visible cards, trump, lead, or legal-move constraints when relevant.\n"
        "- Do not mention cards held by opponents or partner unless they are explicitly visible.\n"
        "- Do not say a move is legal for a reason that is not present in the state.\n"
        '- Keep the reasoning short: one or two sentences, under 45 words.\n'
        "Return only a JSON object with this exact schema:\n"
        '{"reasoning":"short strategic explanation","move":"ONE_LEGAL_MOVE_TOKEN"}\n'
        "The move must be exactly one of the listed legal move tokens."
    )
    return (
        f"<start_of_turn>system\n{SYSTEM_PROMPT}<end_of_turn>\n"
        f"<start_of_turn>user\n{user_prompt}<end_of_turn>\n"
        "<start_of_turn>model\n"
    )


def rebuild_game(engine_state: dict[str, Any]) -> EuchreGame:
    return EuchreGame.from_dict(engine_state)


def ollama_generate(
    *,
    model: str,
    prompt: str,
    host: str,
    timeout_s: float,
    retries: int,
    options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {
        "model": model,
        "prompt": prompt,
        "raw": True,
        "stream": False,
        "format": "json",
        "options": options or {"temperature": 0.2},
    }
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{host.rstrip('/')}/api/generate",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    last_error: Exception | None = None
    for attempt in range(retries + 1):
        started = time.perf_counter()
        try:
            with urllib.request.urlopen(request, timeout=timeout_s) as response:
                body = response.read().decode("utf-8")
            parsed = json.loads(body)
            parsed["latency_ms"] = round((time.perf_counter() - started) * 1000, 2)
            parsed["attempt"] = attempt + 1
            return parsed
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt >= retries:
                break
            time.sleep(1 + attempt)

    raise RuntimeError(
        f"Ollama request failed after {retries + 1} attempts: {last_error}"
    ) from last_error


def openai_chat_generate(
    *,
    model: str,
    prompt: str,
    host: str,
    timeout_s: float,
    retries: int,
    temperature: float = 0.2,
) -> dict[str, Any]:
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": temperature,
    }
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{host.rstrip('/')}/v1/chat/completions",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    last_error: Exception | None = None
    for attempt in range(retries + 1):
        started = time.perf_counter()
        try:
            with urllib.request.urlopen(request, timeout=timeout_s) as response:
                body = response.read().decode("utf-8")
            parsed = json.loads(body)
            parsed["latency_ms"] = round((time.perf_counter() - started) * 1000, 2)
            parsed["attempt"] = attempt + 1
            return parsed
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt >= retries:
                break
            time.sleep(1 + attempt)

    raise RuntimeError(
        f"OpenAI-compatible request failed after {retries + 1} attempts: {last_error}"
    ) from last_error
