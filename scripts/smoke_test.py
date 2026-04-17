from __future__ import annotations

from euchre_game import EuchreGame, Phase
from euchre_game.game import effective_suit


def choose_move(game: EuchreGame) -> dict[str, object]:
    moves = game.get_legal_moves()
    if not moves:
        raise RuntimeError(f"No legal moves available in phase {game.phase!r}")

    if game.phase == Phase.ORDER_UP:
        return next(move for move in moves if move["type"] == "order_up")

    if game.phase == Phase.CALL_TRUMP:
        return next(move for move in moves if move["type"] == "call_trump")

    if game.phase == Phase.DEALER_DISCARD:
        assert game.trump is not None
        non_trump_moves = [
            move
            for move in moves
            if effective_suit(str(move["card"]), game.trump) != game.trump
        ]
        return non_trump_moves[0] if non_trump_moves else moves[0]

    return moves[0]


def main() -> None:
    game = EuchreGame.new_game(seed=7, dealer=0)
    while game.phase != Phase.HAND_COMPLETE:
        game.apply_move(choose_move(game))

    assert sum(game.tricks_won.values()) == 5
    assert all(len(hand) == 0 for hand in game.hands.values())
    assert game.hand_result is not None
    assert game.trump is not None

    print("Smoke test passed")
    print(f"Trump: {game.trump}")
    print(f"Tricks won: {game.tricks_won}")
    print(f"Scores: {game.scores}")
    print(f"Hand result: {game.hand_result}")


if __name__ == "__main__":
    main()
