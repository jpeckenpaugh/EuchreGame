# Roadmap

## Current Foundation

The repository now has these baseline pieces in place:

- Python package scaffolding and local development setup
- a headless Euchre engine with deterministic dealing and state transitions
- serialization and masked-view support
- core tests, linting, and type-checking
- a browser sandbox that runs the engine through Pyodide and simulates random legal moves

## Remaining Phases

### 1. Rule Spec Hardening

- document the exact Euchre variant being targeted
- define scoring, dealer rotation, trump-calling assumptions, and any non-goals
- make variant assumptions explicit before widening the API

### 2. Engine and API Expansion

- harden action and event schemas for downstream integrations
- add more edge-case coverage around trick resolution and illegal actions
- consider whether enums or stronger typed state objects should replace more stringly-typed values

### 3. Rules Completeness

- decide whether to support going alone and other regional variants
- expand the engine only after the target rule set is fixed

### 4. ML and Dataset Integration

- add structured observation and action schemas for model use
- add replay or trajectory export for dataset generation
- support agent-driven play loops that can swap between random, heuristic, or model policies

### 5. Browser Sandbox Evolution

- keep the HTML UI focused on inspection and debugging
- preserve masked views and event logs as first-class debugging tools
- replace random move selection with model inference when the engine API is stable enough

### 6. Documentation and Delivery

- document public engine APIs and state schemas in more detail
- add clearer examples for simulation, replay, and browser-driven usage
- add CI-ready verification commands if this repo is going to be shared more broadly

