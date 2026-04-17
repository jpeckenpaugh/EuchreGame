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
- a vendored local WebLLM runtime under `html/vendor/web-llm/`
- a Python bridge in `html/python/game_bridge.py`
- browser persistence through IndexedDB for app state and metrics

The runtime loop is:

`UI action -> Pyodide Python bridge -> JSON snapshot -> DOM update`

That split is intentional:

- JavaScript owns rendering, controls, and DOM updates
- JavaScript owns AI inference, local model loading, fallback logic, and persistence
- Python owns game state, compact AI context formatting, move-token application, and snapshot formatting

## Browser UI Expectations

The browser sandbox should continue supporting:

- a felt-table view of all four seats
- a center area for current trick and upcard
- a game log for debugging and inspection
- a `God View` that shows all hands
- player-specific masked views using `get_masked_state(viewer_seat=X)`
- stepwise simulation and autoplay of random legal moves
- AI mode that can swap in model-selected moves without changing the core engine API
- persistent baseline metrics across page loads

## Future AI Integration

The current HTML sandbox now supports an AI integration path where JavaScript can:

1. fetch compact acting-player state from the Python bridge
2. call a local WebLLM model with JSON-mode output
3. send the chosen move token back to Python for legal application
4. fall back to random play if the AI output is invalid or illegal

This keeps the legal-move gate inside the Python engine while letting the browser layer own
model loading and baseline evaluation.

At a high level, the upgrade path is:

1. Keep the engine API stable around legal moves and state export.
2. Improve model prompts and structured outputs while keeping legal-move tokens explicit.
3. Preserve masked-view semantics so the model only sees information allowed for its seat.
4. Keep the browser UI as the debugging and evaluation surface for model behavior.
5. Continue using local ignored asset folders instead of committing model binaries.
