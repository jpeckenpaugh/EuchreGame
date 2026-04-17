# EuchreGame

`EuchreGame` is a headless Python package for deterministic Euchre simulation with AI/ML-friendly state export. The repository is structured for local development, test automation, masked player views, and JSON serialization suitable for LLM or policy-model pipelines.

## Current Scope

The initial implementation includes:

- deterministic deck construction and seeded shuffling
- a stateful `EuchreGame` engine
- bidding support for round-one order-up and round-two trump calling
- dealer pickup/discard when the upcard is ordered
- trick play with correct left-bower and right-bower handling
- legal move generation with effective-suit follow rules
- JSON-friendly `to_dict` / `from_dict`
- masked per-player state export for hidden-information workflows
- pytest coverage for core behaviors
- a smoke-test script that plays through a hand end to end

## Rule Assumptions

This repository currently models a standard four-player, partnership Euchre hand with:

- a 24-card deck (`9`, `T`, `J`, `Q`, `K`, `A`)
- teams `0 & 2` versus `1 & 3`
- five-card hands
- two-round trump selection
- `stick_the_dealer=True` by default so every hand resolves without a redeal
- scoring of `1` point for a made hand, `2` for a march, and `2` for a euchre

Not implemented yet:

- going alone
- configurable regional scoring variants
- a full match controller that automatically loops hands until a game winner

## Project Layout

```text
euchre_game/         Package source
scripts/             Bootstrap and smoke-test scripts
tests/               Pytest coverage
requirements.txt     Runtime dependency list
requirements-dev.txt Development and verification dependencies
pyproject.toml       Package metadata and tool configuration
```

## Quick Start

### 1. Create the virtual environment

```bash
./scripts/setup_venv.sh
```

### 2. Activate it

```bash
source .venv/bin/activate
```

### 3. Run the smoke test

```bash
python scripts/smoke_test.py
```

### 4. Run the test suite

```bash
pytest
```

## Minimal Example

```python
from euchre_game import EuchreGame

game = EuchreGame.new_game(seed=7, dealer=0)
viewer_state = game.get_masked_state(viewer_seat=0)
legal_moves = game.get_legal_moves()

print(viewer_state["phase"])
print(legal_moves)
```

## Smoke Test Expectations

The smoke test should:

- create a deterministic game
- choose legal actions through bidding, discard, and trick play
- finish the hand cleanly
- print a short summary including the trump suit, trick totals, and score update

If that script succeeds and `pytest` passes, the scaffolded project is in a healthy working state.

