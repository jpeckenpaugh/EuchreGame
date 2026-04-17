from __future__ import annotations

from euchre_game import EuchreGame, Phase, effective_suit


def choose_move(game: EuchreGame) -> dict[str, object]:
    moves = game.get_legal_moves()
    assert moves

    if game.phase == Phase.ORDER_UP:
        return next(move for move in moves if move["type"] == "order_up")

    if game.phase == Phase.CALL_TRUMP:
        return next(move for move in moves if move["type"] == "call_trump")

    if game.phase == Phase.DEALER_DISCARD:
        assert game.trump is not None
        non_trump = [
            move
            for move in moves
            if effective_suit(str(move["card"]), game.trump) != game.trump
        ]
        return non_trump[0] if non_trump else moves[0]

    return moves[0]


def test_left_bower_uses_trump_suit() -> None:
    assert effective_suit("JH", "D") == "D"
    assert effective_suit("JS", "C") == "C"


def test_masked_state_hides_other_hands() -> None:
    game = EuchreGame.new_game(seed=7)
    masked = game.get_masked_state(viewer_seat=0)

    assert masked["hands"]["0"] == game.hands[0]
    assert masked["hands"]["1"] == ["??"] * len(game.hands[1])
    assert masked["hands"]["2"] == ["??"] * len(game.hands[2])
    assert masked["hands"]["3"] == ["??"] * len(game.hands[3])
    assert masked["buried_cards"] == ["??"] * len(game.buried_cards)


def test_serialization_round_trip_preserves_state() -> None:
    game = EuchreGame.new_game(seed=11)
    game.apply_move({"type": "pass"})
    payload = game.to_dict()

    restored = EuchreGame.from_dict(payload)

    assert restored.to_dict() == payload


def test_follow_suit_uses_effective_suit_for_left_bower() -> None:
    payload = {
        "phase": "playing",
        "winning_score": 10,
        "stick_the_dealer": True,
        "seed": None,
        "hand_number": 1,
        "dealer": 0,
        "leader": 1,
        "current_player": 2,
        "calling_round": 2,
        "upcard": "9S",
        "trump": "D",
        "maker": 1,
        "ordered_up_by": None,
        "scores": {"0": 0, "1": 0},
        "tricks_won": {"0": 0, "1": 0},
        "hands": {
            "0": [],
            "1": [],
            "2": ["9C", "JH"],
            "3": [],
        },
        "buried_cards": [],
        "bidding_history": [],
        "current_trick": [{"player": 1, "card": "KD"}],
        "trick_history": [],
        "hand_result": None,
    }
    game = EuchreGame.from_dict(payload)

    legal = game.get_legal_moves()

    assert legal == [{"type": "play_card", "player": 2, "card": "JH"}]


def test_smoke_hand_completes_and_scores() -> None:
    game = EuchreGame.new_game(seed=7, dealer=0)

    while game.phase != Phase.HAND_COMPLETE:
        game.apply_move(choose_move(game))

    assert sum(game.tricks_won.values()) == 5
    assert all(len(hand) == 0 for hand in game.hands.values())
    assert game.hand_result is not None
    assert sum(game.scores.values()) >= 1

