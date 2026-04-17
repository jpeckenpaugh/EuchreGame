# EuchreGame

`EuchreGame` is a headless Python package for deterministic Euchre simulation with AI/ML-friendly state export. The repository is structured for local development, test automation, masked player views, and JSON serialization suitable for LLM or policy-model pipelines.

Design and roadmap notes now live in:

- [docs/ARCHITECTURE.md](/Users/jarad/git/EuchreGame/docs/ARCHITECTURE.md)
- [docs/ROADMAP.md](/Users/jarad/git/EuchreGame/docs/ROADMAP.md)

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
- a browser-based HTML sandbox that runs the Python engine through Pyodide

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
html/                Browser UI sandbox powered by Pyodide
docs/                Architecture and roadmap notes
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

## HTML Web UI

The repository also includes a browser sandbox under `html/` that runs the local Python
`EuchreGame` package in Pyodide. It can autoplay random legal moves so you can watch bidding,
discarding, trick play, score changes, and masked player views in a browser.

### Run the browser UI

From the repository root:

```bash
python3 -m http.server
```

Then open:

```text
http://127.0.0.1:8000/html/
```

### What to verify in the browser

- click `New Match` to reset the game state
- click `Next Move` to advance one legal action at a time
- click `Auto Play` to let the random simulation continue across hands
- switch between `God View` and player-specific views to confirm masking behavior
- confirm the event log, current trick, upcard, trump, and scores continue updating

The HTML UI uses a vendored local copy of Pyodide under `html/vendor/pyodide/`, so a plain
`http.server` is enough. No frontend build step is required.

The UI architecture is documented in [docs/ARCHITECTURE.md](/Users/jarad/git/EuchreGame/docs/ARCHITECTURE.md).

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

For browser verification, the Web UI should load to a ready state and start a new match without
console errors when served from `python3 -m http.server`.

## Next Work

The remaining implementation plan is tracked in
[docs/ROADMAP.md](/Users/jarad/git/EuchreGame/docs/ROADMAP.md).
