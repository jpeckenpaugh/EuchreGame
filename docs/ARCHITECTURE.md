# Architecture

## Core Goals

`EuchreGame` is intended to stay:

- headless and modular
- deterministic and easy to replay
- JSON-friendly for LLM or policy-model inputs
- correct on Euchre-specific rules such as bowers and effective suit
- capable of masked player views for hidden-information play

The core engine should continue centering on state management, legal move generation,
serialization, and phase-aware state transitions rather than UI concerns.

## Engine Shape

The current package structure is built around:

- constants for suits, ranks, seats, team mappings, and ordering logic
- internal game state for hands, scores, trick state, dealer, leader, and turn
- key methods such as `get_legal_moves`, `apply_move`, `to_dict`, `from_dict`, and `get_masked_state`

This should remain the main API surface for downstream simulations, testing, and model integration.

## Browser UI Architecture

The `html/` sandbox exists as an AI testing surface for the Python engine. The current browser stack is:

- vanilla HTML, CSS, and JavaScript
- Pyodide for running the local Python engine in-browser
- a vendored local Pyodide runtime under `html/vendor/pyodide/`
- a Python bridge in `html/python/game_bridge.py`

The runtime loop is:

`UI action -> Pyodide Python bridge -> JSON snapshot -> DOM update`

That split is intentional:

- JavaScript owns rendering, controls, and DOM updates
- Python owns game state, random move selection, and snapshot formatting

## Browser UI Expectations

The browser sandbox should continue supporting:

- a felt-table view of all four seats
- a center area for current trick and upcard
- a game log for debugging and inspection
- a `God View` that shows all hands
- player-specific masked views using `get_masked_state(viewer_seat=X)`
- stepwise simulation and autoplay of random legal moves

## Future AI Integration

The current HTML sandbox proves that the game engine can run in-browser with random legal play.
The intended next step for model integration is to replace the random move chooser in the Python
bridge with an inference call that consumes serialized state and returns a legal action.

At a high level, the upgrade path is:

1. Keep the engine API stable around legal moves and state export.
2. Replace random move selection with model-driven action selection.
3. Preserve masked-view semantics so the model only sees information allowed for its seat.
4. Keep the browser UI as the debugging and evaluation surface for model behavior.

