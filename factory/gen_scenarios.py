from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

if TYPE_CHECKING:
    from euchre_game import EuchreGame


def choose_random_move(game: EuchreGame, rng: random.Random) -> dict[str, Any]:
    moves = game.get_legal_moves()
    if not moves:
        raise RuntimeError(f"No legal moves available during phase {game.phase!r}")
    return dict(rng.choice(moves))


def generate_scenarios(
    *,
    seed: int,
    max_scenarios: int,
    winning_score: int,
    include_forced: bool = False,
) -> list[dict[str, Any]]:
    scenarios, _ = collect_scenarios(
        seed=seed,
        max_scenarios=max_scenarios,
        winning_score=winning_score,
        include_forced=include_forced,
    )
    return scenarios


def collect_scenarios(
    *,
    seed: int,
    max_scenarios: int,
    winning_score: int,
    include_forced: bool = False,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    from euchre_game import EuchreGame, Phase
    from factory.common import move_to_token

    rng = random.Random(seed)
    game = EuchreGame.new_game(
        seed=rng.randrange(1, 10_000_000),
        dealer=rng.randrange(4),
        winning_score=winning_score,
    )
    session_id = f"session-{seed}"
    scenarios: list[dict[str, Any]] = []
    turn_id = 0
    stats = {
        "candidate_turns": 0,
        "kept_scenarios": 0,
        "skipped_forced_moves": 0,
    }

    while len(scenarios) < max_scenarios:
        if game.phase == Phase.HAND_COMPLETE:
            game.start_next_hand(seed=rng.randrange(1, 10_000_000))
            continue

        active_player = game.current_player
        if active_player is None:
            raise RuntimeError("Expected an active player while generating scenarios.")

        masked_state = game.get_masked_state(active_player)
        legal_moves = [dict(move) for move in game.get_legal_moves()]
        legal_move_tokens = [move_to_token(move) for move in legal_moves]
        stats["candidate_turns"] += 1
        if include_forced or len(legal_move_tokens) > 1:
            scenarios.append(
                {
                    "session_id": session_id,
                    "hand_id": game.hand_number,
                    "turn_id": turn_id,
                    "viewer_seat": active_player,
                    "seed": seed,
                    "engine_state": game.to_dict(),
                    "masked_state": masked_state,
                    "legal_moves": legal_moves,
                    "legal_move_tokens": legal_move_tokens,
                    "phase": str(masked_state["phase"]),
                    "legal_move_count": len(legal_move_tokens),
                }
            )
            stats["kept_scenarios"] += 1
        else:
            stats["skipped_forced_moves"] += 1
        turn_id += 1

        move = choose_random_move(game, rng)
        game.apply_move(move)

    return scenarios, stats


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate masked Euchre scenarios as JSONL.")
    parser.add_argument(
        "--seed",
        type=int,
        default=7,
        help="Base RNG seed for scenario generation.",
    )
    parser.add_argument(
        "--max-scenarios",
        type=int,
        default=10,
        help="Number of scenarios to emit.",
    )
    parser.add_argument(
        "--winning-score",
        type=int,
        default=10,
        help="Winning score used while simulating ongoing sessions.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("factory/output/scenarios.jsonl"),
        help="Output JSONL path.",
    )
    parser.add_argument(
        "--include-forced",
        action="store_true",
        help="Include states with only one legal move.",
    )
    return parser.parse_args()


def main() -> None:
    from factory.common import append_jsonl, ensure_output_dir

    args = parse_args()
    ensure_output_dir(args.output.parent)
    if args.max_scenarios < 1:
        raise SystemExit("--max-scenarios must be at least 1")

    scenarios = generate_scenarios(
        seed=args.seed,
        max_scenarios=args.max_scenarios,
        winning_score=args.winning_score,
        include_forced=args.include_forced,
    )

    if args.output.exists():
        args.output.unlink()
    for row in scenarios:
        append_jsonl(args.output, row)

    print(f"Wrote {len(scenarios)} scenarios to {args.output}")


if __name__ == "__main__":
    main()
