from __future__ import annotations

import json
from random import Random
from typing import Any

from euchre_game import EuchreGame, Phase
from euchre_game.constants import PARTNER_BY_SEAT, SEATS, TEAM_BY_SEAT

SUIT_SYMBOLS = {"C": "♣", "D": "♦", "H": "♥", "S": "♠"}
SUIT_NAMES = {"C": "Clubs", "D": "Diamonds", "H": "Hearts", "S": "Spades"}
SEAT_NAMES = {0: "North", 1: "East", 2: "South", 3: "West"}
TEAM_LABELS = {0: "North / South", 1: "East / West"}
PHASE_LABELS = {
    Phase.ORDER_UP: "Round 1 Bidding",
    Phase.CALL_TRUMP: "Round 2 Bidding",
    Phase.DEALER_DISCARD: "Dealer Discard",
    Phase.PLAYING: "Trick Play",
    Phase.HAND_COMPLETE: "Hand Complete",
}


def _card_text(card: str | None) -> str:
    if not card:
        return "-"
    if card == "??":
        return "Hidden"
    rank = card[0]
    suit = card[1]
    return f"{rank}{SUIT_SYMBOLS.get(suit, suit)}"


class GameBridge:
    def __init__(self) -> None:
        self.random = Random()
        self.game: EuchreGame | None = None
        self.logs: list[str] = []
        self.last_event: dict[str, Any] | None = None
        self.view_mode = "god"
        self.viewer_seat = 0

    def new_match(self, seed: int | None = None, winning_score: int = 10) -> dict[str, Any]:
        self.random = Random(seed)
        self.logs = []
        self.last_event = None
        dealer = self.random.randrange(4)
        hand_seed = self._next_hand_seed()
        self.game = EuchreGame.new_game(seed=hand_seed, dealer=dealer, winning_score=winning_score)
        self._log(
            f"Match started. {SEAT_NAMES[dealer]} deals. Upcard is {_card_text(self.game.upcard)}."
        )
        return self.snapshot()

    def step_random(self) -> dict[str, Any]:
        game = self._require_game()
        if game.phase == Phase.HAND_COMPLETE:
            if game.winning_team is not None:
                return self.snapshot()
            game.start_next_hand(seed=self._next_hand_seed())
            self.last_event = {"type": "new_hand", "hand_number": game.hand_number}
            self._log(
                f"Hand {game.hand_number} begins. {SEAT_NAMES[game.dealer]} deals. "
                f"Upcard is {_card_text(game.upcard)}."
            )
            return self.snapshot()

        legal_moves = game.get_legal_moves()
        if not legal_moves:
            raise RuntimeError("No legal moves are available for the current state.")

        move = self.random.choice(legal_moves)
        event = game.apply_move(move)
        self.last_event = event
        self._log(self._describe_event(event))
        return self.snapshot()

    def set_view(self, view_mode: str = "god", viewer_seat: int = 0) -> dict[str, Any]:
        self.view_mode = "god" if view_mode != "seat" else "seat"
        self.viewer_seat = viewer_seat if viewer_seat in SEATS else 0
        return self.snapshot()

    def snapshot(self) -> dict[str, Any]:
        game = self._require_game()
        base_state = game.to_dict()
        visible_state = (
            base_state if self.view_mode == "god" else game.get_masked_state(self.viewer_seat)
        )
        legal_moves = (
            game.get_legal_moves()
            if self.view_mode == "god"
            else list(visible_state.get("legal_moves", []))
        )

        players = []
        for seat in SEATS:
            cards = list(visible_state["hands"][str(seat)])
            players.append(
                {
                    "seat": seat,
                    "name": SEAT_NAMES[seat],
                    "team": TEAM_BY_SEAT[seat],
                    "team_label": TEAM_LABELS[TEAM_BY_SEAT[seat]],
                    "partner": PARTNER_BY_SEAT[seat],
                    "cards": cards,
                    "card_count": len(cards),
                    "is_current": game.current_player == seat,
                    "is_dealer": game.dealer == seat,
                    "is_maker": game.maker == seat if game.maker is not None else False,
                }
            )

        return {
            "summary": {
                "hand_number": game.hand_number,
                "phase": game.phase.value,
                "phase_label": PHASE_LABELS[game.phase],
                "dealer": game.dealer,
                "current_player": game.current_player,
                "leader": game.leader,
                "trump": game.trump,
                "upcard": game.upcard,
                "scores": dict(game.scores),
                "tricks_won": dict(game.tricks_won),
                "winning_team": game.winning_team,
                "winning_score": game.winning_score,
                "match_complete": game.winning_team is not None,
                "stick_the_dealer": game.stick_the_dealer,
                "hand_result": game.hand_result,
            },
            "view": {
                "mode": self.view_mode,
                "viewer_seat": self.viewer_seat,
                "label": "God View"
                if self.view_mode == "god"
                else f"{SEAT_NAMES[self.viewer_seat]} View",
            },
            "players": players,
            "current_trick": [
                {
                    "player": play["player"],
                    "player_name": SEAT_NAMES[int(play["player"])],
                    "card": play["card"],
                }
                for play in visible_state["current_trick"]
            ],
            "legal_moves": legal_moves,
            "visible_state": visible_state,
            "last_event": self.last_event,
            "last_message": self.logs[-1] if self.logs else "Ready.",
            "logs": self.logs[-80:],
        }

    def _require_game(self) -> EuchreGame:
        if self.game is None:
            self.game = EuchreGame.new_game()
        return self.game

    def _next_hand_seed(self) -> int:
        return self.random.randrange(1, 10_000_000)

    def _log(self, message: str) -> None:
        self.logs.append(message)

    def _describe_event(self, event: dict[str, Any]) -> str:
        event_type = event["type"]
        if event_type == "pass":
            round_number = event.get("round", "?")
            player = int(event["player"])
            return f"{SEAT_NAMES[player]} passes in round {round_number}."

        if event_type == "order_up":
            player = int(event["player"])
            trump = SUIT_NAMES[str(event["trump"])]
            dealer = int(event["dealer"])
            return (
                f"{SEAT_NAMES[player]} orders up {trump}. "
                f"{SEAT_NAMES[dealer]} must pick up the upcard and discard."
            )

        if event_type == "call_trump":
            player = int(event["player"])
            trump = SUIT_NAMES[str(event["trump"])]
            return f"{SEAT_NAMES[player]} calls {trump} as trump."

        if event_type == "discard":
            player = int(event["player"])
            return f"{SEAT_NAMES[player]} discards {_card_text(str(event['card']))}."

        if event_type == "play_card":
            message = (
                f"{SEAT_NAMES[int(event['player'])]} plays {_card_text(str(event['card']))}."
            )
            if "trick_winner" in event:
                winner = int(event["trick_winner"])
                winner_team = TEAM_BY_SEAT[winner]
                tricks = self._require_game().tricks_won[winner_team]
                message += (
                    f" {SEAT_NAMES[winner]} takes the trick for {TEAM_LABELS[winner_team]} "
                    f"({tricks} trick{'s' if tricks != 1 else ''})."
                )
            if "hand_result" in event:
                message += f" {self._format_hand_result(event['hand_result'])}"
            return message

        if event_type == "new_hand":
            return f"Hand {event['hand_number']} begins."

        return json.dumps(event)

    def _format_hand_result(self, result: dict[str, Any]) -> str:
        winner_team = int(result["winner_team"])
        points = int(result["points_awarded"][str(winner_team)])
        if result.get("euchred"):
            message = f"{TEAM_LABELS[winner_team]} scores {points} for the euchre."
        elif result.get("march"):
            message = f"{TEAM_LABELS[winner_team]} marches and scores {points}."
        else:
            message = f"{TEAM_LABELS[winner_team]} scores {points}."

        game = self._require_game()
        if result.get("game_over") and game.winning_team is not None:
            message += (
                f" Match won {game.scores[0]} to {game.scores[1]} by "
                f"{TEAM_LABELS[game.winning_team]}."
            )
        return message


BRIDGE = GameBridge()


def call_from_js(command: str, payload_json: str = "{}") -> str:
    try:
        payload = json.loads(payload_json or "{}")
        if command == "new_match":
            data = BRIDGE.new_match(
                seed=_maybe_int(payload.get("seed")),
                winning_score=int(payload.get("winning_score", 10)),
            )
        elif command == "step_random":
            BRIDGE.set_view(
                view_mode=str(payload.get("view_mode", "god")),
                viewer_seat=int(payload.get("viewer_seat", 0)),
            )
            data = BRIDGE.step_random()
        elif command == "set_view":
            data = BRIDGE.set_view(
                view_mode=str(payload.get("view_mode", "god")),
                viewer_seat=int(payload.get("viewer_seat", 0)),
            )
        elif command == "get_snapshot":
            BRIDGE.set_view(
                view_mode=str(payload.get("view_mode", "god")),
                viewer_seat=int(payload.get("viewer_seat", 0)),
            )
            data = BRIDGE.snapshot()
        else:
            raise ValueError(f"Unknown bridge command: {command}")
        return json.dumps({"ok": True, "data": data})
    except Exception as exc:  # pragma: no cover - browser surface
        return json.dumps({"ok": False, "error": str(exc)})


def _maybe_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    return int(value)
