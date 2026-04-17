from __future__ import annotations

from collections.abc import Mapping
from copy import deepcopy
from enum import StrEnum
from random import Random
from typing import Any

from .constants import (
    NATURAL_RANK_ORDER,
    NEXT_SEAT,
    NON_TRUMP_STRENGTH,
    PARTNER_BY_SEAT,
    RANKS,
    SAME_COLOR_SUIT,
    SEATS,
    SUITS,
    TEAM_BY_SEAT,
    TRUMP_STRENGTH,
)


class IllegalMoveError(ValueError):
    """Raised when a move is not legal in the current game state."""


class Phase(StrEnum):
    ORDER_UP = "order_up"
    CALL_TRUMP = "call_trump"
    DEALER_DISCARD = "dealer_discard"
    PLAYING = "playing"
    HAND_COMPLETE = "hand_complete"


Action = dict[str, Any]
TrickPlay = tuple[int, str]


def build_deck() -> list[str]:
    return [f"{rank}{suit}" for suit in SUITS for rank in RANKS]


def next_seat(seat: int) -> int:
    return NEXT_SEAT[seat]


def card_rank(card: str) -> str:
    return card[0]


def card_suit(card: str) -> str:
    return card[1]


def effective_suit(card: str, trump: str | None) -> str:
    suit = card_suit(card)
    if trump is None:
        return suit
    if card_rank(card) == "J" and suit != trump and SAME_COLOR_SUIT[suit] == trump:
        return trump
    return suit


def natural_sort_key(card: str) -> tuple[int, int]:
    return (SUITS.index(card_suit(card)), NATURAL_RANK_ORDER[card_rank(card)])


def trump_strength(card: str, trump: str) -> int:
    suit = card_suit(card)
    rank = card_rank(card)
    if rank == "J" and suit == trump:
        return 7
    if rank == "J" and suit != trump and SAME_COLOR_SUIT[suit] == trump:
        return 6
    return TRUMP_STRENGTH[rank]


def card_strength(card: str, led_suit: str, trump: str) -> tuple[int, int]:
    suit = effective_suit(card, trump)
    if suit == trump:
        return (2, trump_strength(card, trump))
    if suit == led_suit:
        return (1, NON_TRUMP_STRENGTH[card_rank(card)])
    return (0, 0)


class EuchreGame:
    """A headless Euchre engine with deterministic dealing and JSON-friendly state export."""

    def __init__(
        self,
        *,
        winning_score: int = 10,
        stick_the_dealer: bool = True,
        seed: int | None = None,
        dealer: int = 0,
        auto_deal: bool = True,
    ) -> None:
        self.winning_score = winning_score
        self.stick_the_dealer = stick_the_dealer
        self.seed = seed
        self.dealer = dealer % 4
        self.hand_number = 0
        self.scores: dict[int, int] = {0: 0, 1: 0}
        self._clear_hand_state()
        if auto_deal:
            self.deal_new_hand(seed=seed, dealer=self.dealer)

    @classmethod
    def new_game(
        cls,
        *,
        winning_score: int = 10,
        stick_the_dealer: bool = True,
        seed: int | None = None,
        dealer: int = 0,
    ) -> EuchreGame:
        return cls(
            winning_score=winning_score,
            stick_the_dealer=stick_the_dealer,
            seed=seed,
            dealer=dealer,
            auto_deal=True,
        )

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> EuchreGame:
        game = cls(
            winning_score=int(payload.get("winning_score", 10)),
            stick_the_dealer=bool(payload.get("stick_the_dealer", True)),
            seed=payload.get("seed"),
            dealer=int(payload.get("dealer", 0)),
            auto_deal=False,
        )
        game.hand_number = int(payload.get("hand_number", 0))
        game.phase = Phase(payload["phase"])
        game.dealer = int(payload.get("dealer", 0))
        game.leader = _maybe_int(payload.get("leader"))
        game.current_player = _maybe_int(payload.get("current_player"))
        game.calling_round = int(payload.get("calling_round", 0))
        game.upcard = _maybe_str(payload.get("upcard"))
        game.trump = _maybe_str(payload.get("trump"))
        game.maker = _maybe_int(payload.get("maker"))
        game.ordered_up_by = _maybe_int(payload.get("ordered_up_by"))
        game.scores = _int_map(payload.get("scores"), default_keys=(0, 1))
        game.tricks_won = _int_map(payload.get("tricks_won"), default_keys=(0, 1))
        game.hands = _card_map(payload.get("hands"))
        game.buried_cards = list(payload.get("buried_cards", []))
        game.bidding_history = [dict(entry) for entry in payload.get("bidding_history", [])]
        game.current_trick = [
            (int(entry["player"]), str(entry["card"]))
            for entry in payload.get("current_trick", [])
        ]
        game.trick_history = [dict(entry) for entry in payload.get("trick_history", [])]
        game.hand_result = _maybe_dict(payload.get("hand_result"))
        return game

    def _clear_hand_state(self) -> None:
        self.phase = Phase.HAND_COMPLETE
        self.leader: int | None = None
        self.current_player: int | None = None
        self.calling_round = 0
        self.upcard: str | None = None
        self.trump: str | None = None
        self.maker: int | None = None
        self.ordered_up_by: int | None = None
        self.hands: dict[int, list[str]] = {seat: [] for seat in SEATS}
        self.buried_cards: list[str] = []
        self.bidding_history: list[Action] = []
        self.current_trick: list[TrickPlay] = []
        self.trick_history: list[Action] = []
        self.tricks_won: dict[int, int] = {0: 0, 1: 0}
        self.hand_result: Action | None = None

    def deal_new_hand(
        self,
        *,
        seed: int | None = None,
        dealer: int | None = None,
    ) -> dict[str, Any]:
        if dealer is not None:
            self.dealer = dealer % 4
        self.seed = seed
        self.hand_number += 1
        self._clear_hand_state()

        deck = build_deck()
        Random(seed).shuffle(deck)

        for seat in SEATS:
            self.hands[seat] = []
        for index, card in enumerate(deck[:20]):
            self.hands[index % 4].append(card)
        for seat in SEATS:
            self.hands[seat].sort(key=natural_sort_key)

        self.upcard = deck[20]
        self.buried_cards = list(deck[21:])
        self.phase = Phase.ORDER_UP
        self.calling_round = 1
        self.current_player = next_seat(self.dealer)
        self.leader = next_seat(self.dealer)
        return self.to_dict()

    def start_next_hand(self, *, seed: int | None = None) -> dict[str, Any]:
        return self.deal_new_hand(seed=seed, dealer=next_seat(self.dealer))

    @property
    def winning_team(self) -> int | None:
        for team, score in self.scores.items():
            if score >= self.winning_score:
                return team
        return None

    def get_legal_moves(self, player: int | None = None) -> list[Action]:
        active_player = self.current_player if player is None else player
        if active_player is None or active_player != self.current_player:
            return []

        if self.phase == Phase.ORDER_UP:
            return [
                {"type": "pass", "player": active_player},
                {"type": "order_up", "player": active_player},
            ]

        if self.phase == Phase.CALL_TRUMP:
            moves = [
                {"type": "call_trump", "player": active_player, "suit": suit}
                for suit in SUITS
                if suit != card_suit(self.upcard or "")
            ]
            if self._forced_to_call(active_player):
                return moves
            return [{"type": "pass", "player": active_player}, *moves]

        if self.phase == Phase.DEALER_DISCARD:
            if active_player != self.dealer:
                return []
            return [
                {"type": "discard", "player": active_player, "card": card}
                for card in self.hands[active_player]
            ]

        if self.phase == Phase.PLAYING:
            return [
                {"type": "play_card", "player": active_player, "card": card}
                for card in self._legal_cards_for_player(active_player)
            ]

        return []

    def apply_move(self, move: Mapping[str, Any]) -> Action:
        move_type = str(move.get("type", ""))
        player = _resolve_player(move.get("player"), self.current_player)
        self._require_current_player(player)

        if move_type == "pass":
            return self._apply_pass(player)
        if move_type == "order_up":
            return self._apply_order_up(player)
        if move_type == "call_trump":
            return self._apply_call_trump(player, str(move.get("suit", "")))
        if move_type == "discard":
            return self._apply_discard(player, str(move.get("card", "")))
        if move_type == "play_card":
            return self._apply_play_card(player, str(move.get("card", "")))
        raise IllegalMoveError(f"Unknown move type: {move_type!r}")

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": 1,
            "winning_score": self.winning_score,
            "stick_the_dealer": self.stick_the_dealer,
            "seed": self.seed,
            "hand_number": self.hand_number,
            "phase": self.phase.value,
            "dealer": self.dealer,
            "leader": self.leader,
            "current_player": self.current_player,
            "calling_round": self.calling_round,
            "upcard": self.upcard,
            "trump": self.trump,
            "maker": self.maker,
            "ordered_up_by": self.ordered_up_by,
            "scores": _stringify_map(self.scores),
            "tricks_won": _stringify_map(self.tricks_won),
            "hands": {str(seat): list(cards) for seat, cards in self.hands.items()},
            "hand_sizes": {str(seat): len(cards) for seat, cards in self.hands.items()},
            "buried_cards": list(self.buried_cards),
            "bidding_history": [dict(entry) for entry in self.bidding_history],
            "current_trick": [
                {"player": player, "card": card} for player, card in self.current_trick
            ],
            "trick_history": deepcopy(self.trick_history),
            "hand_result": deepcopy(self.hand_result),
            "winner_team": self.winning_team,
        }

    def get_masked_state(self, viewer_seat: int) -> dict[str, Any]:
        if viewer_seat not in SEATS:
            raise ValueError(f"Invalid viewer seat: {viewer_seat}")

        state = self.to_dict()
        masked_hands: dict[str, list[str]] = {}
        for seat, cards in self.hands.items():
            seat_key = str(seat)
            masked_hands[seat_key] = list(cards) if seat == viewer_seat else ["??"] * len(cards)
        state["viewer_seat"] = viewer_seat
        state["hands"] = masked_hands
        state["buried_cards"] = ["??"] * len(self.buried_cards)
        state["legal_moves"] = self.get_legal_moves(viewer_seat)
        state["viewer_team"] = TEAM_BY_SEAT[viewer_seat]
        state["partner_seat"] = PARTNER_BY_SEAT[viewer_seat]
        return state

    def _apply_pass(self, player: int) -> Action:
        if self.phase == Phase.ORDER_UP:
            event = {"type": "pass", "player": player, "round": 1}
            self.bidding_history.append(event)
            if player == self.dealer:
                self.phase = Phase.CALL_TRUMP
                self.calling_round = 2
                self.current_player = next_seat(self.dealer)
            else:
                self.current_player = next_seat(player)
            return event

        if self.phase == Phase.CALL_TRUMP:
            if self._forced_to_call(player):
                raise IllegalMoveError("Dealer is forced to call trump in round two.")
            event = {"type": "pass", "player": player, "round": 2}
            self.bidding_history.append(event)
            if player == self.dealer:
                self.phase = Phase.HAND_COMPLETE
                self.current_player = None
                self.hand_result = {"type": "passed_out"}
            else:
                self.current_player = next_seat(player)
            return event

        raise IllegalMoveError("Pass is only legal during bidding.")

    def _apply_order_up(self, player: int) -> Action:
        if self.phase != Phase.ORDER_UP or self.upcard is None:
            raise IllegalMoveError("Order up is only legal in round one bidding.")

        self.trump = card_suit(self.upcard)
        self.maker = player
        self.ordered_up_by = player
        self.phase = Phase.DEALER_DISCARD
        self.current_player = self.dealer
        self.hands[self.dealer].append(self.upcard)
        self.hands[self.dealer].sort(key=natural_sort_key)

        event = {
            "type": "order_up",
            "player": player,
            "trump": self.trump,
            "dealer": self.dealer,
        }
        self.bidding_history.append(event)
        return event

    def _apply_call_trump(self, player: int, suit: str) -> Action:
        if self.phase != Phase.CALL_TRUMP:
            raise IllegalMoveError("Call trump is only legal during round two bidding.")
        if suit not in SUITS:
            raise IllegalMoveError(f"Invalid trump suit: {suit!r}")
        if self.upcard is not None and suit == card_suit(self.upcard):
            raise IllegalMoveError("Round two trump cannot match the upcard suit.")

        self.trump = suit
        self.maker = player
        self.phase = Phase.PLAYING
        self.current_player = next_seat(self.dealer)
        self.leader = self.current_player

        event = {"type": "call_trump", "player": player, "trump": suit}
        self.bidding_history.append(event)
        return event

    def _apply_discard(self, player: int, card: str) -> Action:
        if self.phase != Phase.DEALER_DISCARD:
            raise IllegalMoveError("Dealer discard is not currently expected.")
        if player != self.dealer:
            raise IllegalMoveError("Only the dealer may discard after ordering up.")
        if card not in self.hands[player]:
            raise IllegalMoveError(f"Dealer does not hold {card!r}.")

        self.hands[player].remove(card)
        self.hands[player].sort(key=natural_sort_key)
        self.buried_cards.append(card)
        self.phase = Phase.PLAYING
        self.current_player = next_seat(self.dealer)
        self.leader = self.current_player

        return {"type": "discard", "player": player, "card": card}

    def _apply_play_card(self, player: int, card: str) -> Action:
        if self.phase != Phase.PLAYING or self.trump is None:
            raise IllegalMoveError("Cards may only be played during the hand.")
        if card not in self.hands[player]:
            raise IllegalMoveError(f"Player {player} does not hold {card!r}.")
        if card not in self._legal_cards_for_player(player):
            raise IllegalMoveError(f"{card!r} is not a legal play for player {player}.")

        self.hands[player].remove(card)
        self.current_trick.append((player, card))

        event: Action = {"type": "play_card", "player": player, "card": card}
        if len(self.current_trick) < 4:
            self.current_player = next_seat(player)
            return event

        winner = self._resolve_current_trick()
        event["trick_winner"] = winner

        if sum(self.tricks_won.values()) == 5:
            self.phase = Phase.HAND_COMPLETE
            self.current_player = None
            event["hand_result"] = self._score_hand()
        else:
            self.current_player = winner
            self.leader = winner

        return event

    def _resolve_current_trick(self) -> int:
        if self.trump is None or not self.current_trick:
            raise RuntimeError("Cannot resolve a trick without a trump suit and played cards.")

        led_suit = effective_suit(self.current_trick[0][1], self.trump)
        winner, _ = max(
            self.current_trick,
            key=lambda play: card_strength(play[1], led_suit=led_suit, trump=self.trump or ""),
        )

        self.tricks_won[TEAM_BY_SEAT[winner]] += 1
        self.trick_history.append(
            {
                "leader": self.leader,
                "winner": winner,
                "led_suit": led_suit,
                "cards": [
                    {"player": player, "card": card} for player, card in self.current_trick
                ],
            }
        )
        self.current_trick = []
        self.leader = winner
        return winner

    def _score_hand(self) -> Action:
        if self.maker is None:
            raise RuntimeError("Cannot score a hand without a maker.")

        maker_team = TEAM_BY_SEAT[self.maker]
        defender_team = 1 - maker_team
        maker_tricks = self.tricks_won[maker_team]
        defender_tricks = self.tricks_won[defender_team]

        if maker_tricks >= 3:
            points = 2 if maker_tricks == 5 else 1
            winner_team = maker_team
            euchred = False
            march = maker_tricks == 5
        else:
            points = 2
            winner_team = defender_team
            euchred = True
            march = False

        self.scores[winner_team] += points
        self.hand_result = {
            "type": "scored_hand",
            "winner_team": winner_team,
            "maker_team": maker_team,
            "maker_tricks": maker_tricks,
            "defender_tricks": defender_tricks,
            "points_awarded": {str(winner_team): points},
            "euchred": euchred,
            "march": march,
            "game_over": self.winning_team is not None,
        }
        return self.hand_result

    def _legal_cards_for_player(self, player: int) -> list[str]:
        hand = list(self.hands[player])
        if not self.current_trick or self.trump is None:
            return hand

        led_suit = effective_suit(self.current_trick[0][1], self.trump)
        followers = [card for card in hand if effective_suit(card, self.trump) == led_suit]
        return followers if followers else hand

    def _forced_to_call(self, player: int) -> bool:
        return (
            self.phase == Phase.CALL_TRUMP
            and self.stick_the_dealer
            and player == self.dealer
        )

    def _require_current_player(self, player: int) -> None:
        if self.current_player is None:
            raise IllegalMoveError("There is no active player in the current phase.")
        if player != self.current_player:
            raise IllegalMoveError(
                f"It is player {self.current_player}'s turn, not player {player}'s."
            )


def _resolve_player(raw_player: Any, current_player: int | None) -> int:
    if raw_player is None:
        if current_player is None:
            raise IllegalMoveError("This move requires an active player.")
        return current_player
    try:
        return int(raw_player)
    except (TypeError, ValueError) as exc:
        raise IllegalMoveError(f"Invalid player value: {raw_player!r}") from exc


def _stringify_map(values: Mapping[int, int]) -> dict[str, int]:
    return {str(key): int(value) for key, value in values.items()}


def _int_map(raw: Any, *, default_keys: tuple[int, ...]) -> dict[int, int]:
    if not isinstance(raw, Mapping):
        return {key: 0 for key in default_keys}
    values = {key: 0 for key in default_keys}
    for key, value in raw.items():
        values[int(key)] = int(value)
    return values


def _card_map(raw: Any) -> dict[int, list[str]]:
    cards_by_player: dict[int, list[str]] = {seat: [] for seat in SEATS}
    if not isinstance(raw, Mapping):
        return cards_by_player
    for key, value in raw.items():
        cards_by_player[int(key)] = [str(card) for card in value]
    return cards_by_player


def _maybe_int(value: Any) -> int | None:
    if value is None:
        return None
    return int(value)


def _maybe_str(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


def _maybe_dict(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    return dict(value)
