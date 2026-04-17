from __future__ import annotations

from typing import Final

SUITS: Final[tuple[str, str, str, str]] = ("C", "D", "H", "S")
RANKS: Final[tuple[str, str, str, str, str, str]] = ("9", "T", "J", "Q", "K", "A")
SEATS: Final[tuple[int, int, int, int]] = (0, 1, 2, 3)
TEAM_BY_SEAT: Final[dict[int, int]] = {0: 0, 1: 1, 2: 0, 3: 1}
PARTNER_BY_SEAT: Final[dict[int, int]] = {0: 2, 1: 3, 2: 0, 3: 1}
SAME_COLOR_SUIT: Final[dict[str, str]] = {"C": "S", "S": "C", "D": "H", "H": "D"}
NEXT_SEAT: Final[dict[int, int]] = {seat: (seat + 1) % 4 for seat in SEATS}

NATURAL_RANK_ORDER: Final[dict[str, int]] = {rank: index for index, rank in enumerate(RANKS)}
NON_TRUMP_STRENGTH: Final[dict[str, int]] = {"9": 1, "T": 2, "J": 3, "Q": 4, "K": 5, "A": 6}
TRUMP_STRENGTH: Final[dict[str, int]] = {"9": 1, "T": 2, "Q": 3, "K": 4, "A": 5}

