A Python `EuchreGame` class designed specifically for an AI/ML pipeline (distillation, LLM-driven players, Pyodide deployment).
A coding agent (LLM/AI coder).
Clean, modular, headless (no UI), focused on state management, legal move generation, and serialization.

    *   *Input/Output:* Must be easy to convert to JSON for the LLM.
    *   *Perspective:* Must support "Masked Views" (Player $X$ cannot see Player $Y$'s hand).
    *   *Rules:* Must handle the complex rank system (Bowers) and suit following.
    *   *ML-Ready:* Must be deterministic and support fast-forwarding (headless).

    *   Introduction: Goal of the class.
    *   Core Requirements: The "must-haves."
    *   Architecture/Class Structure:
        *   Constants (Suits, Ranks).
        *   Internal State (Deck, Hands, Score).
        *   Key Methods (`get_legal_moves`, `apply_move`, `get_masked_state`).
    *   The "Bower" Logic (the trickiest part of Euchre).
    *   Interface Specification (API).
    *   Implementation Roadmap for the agent.

---

## Implementation Checklist

### Phase 0 - Project Setup

- [ ] Create project directory structure for package code, tests, and docs.
- [ ] Add `README.md` with project purpose, scope, and quick-start instructions.
- [ ] Add `.gitignore` covering `.venv/`, `__pycache__/`, `.pytest_cache/`, build artifacts, and editor files.
- [ ] Add `requirements.txt` for runtime dependencies.
- [ ] Add `requirements-dev.txt` for test and lint tooling.
- [ ] Add a reproducible virtual environment setup script such as `scripts/setup_venv.sh`.
- [ ] Add a lightweight package layout (for example `euchre_game/`).
- [ ] Decide and document supported Python version(s).

### Phase 1 - Rules and Requirements Spec

- [ ] Write a concrete rules spec for the Euchre variant being implemented.
- [ ] Define player count, team structure, scoring rules, dealer rotation, and trump selection flow.
- [ ] Define card representation, suit representation, and canonical JSON serialization format.
- [ ] Define all game phases and allowed actions in each phase.
- [ ] Define invariants for deterministic simulation and reproducible shuffling.
- [ ] Define masked-state requirements for each viewer role.

### Phase 2 - Core Domain Model

- [ ] Implement card, suit, rank, seat, and team constants or enums.
- [ ] Implement deck construction and deterministic shuffle behavior.
- [ ] Implement internal game state model for hands, kitty, trick state, score, dealer, leader, and turn.
- [ ] Define action and event schemas for state transitions.
- [ ] Define a serializable game snapshot structure.

### Phase 3 - Euchre-Specific Rule Engine

- [ ] Implement effective suit logic for left and right bowers.
- [ ] Implement trump ordering and non-trump ordering.
- [ ] Implement trick winner evaluation with bower handling.
- [ ] Implement follow-suit validation based on effective suit.
- [ ] Implement legal move generation for each game phase.
- [ ] Add edge-case coverage for revokes, void suits, and trump-led tricks.

### Phase 4 - State Machine and API

- [ ] Implement `new_game` or equivalent initializer with deterministic seed support.
- [ ] Implement `get_legal_moves`.
- [ ] Implement `apply_move`.
- [ ] Implement phase transitions for deal, ordering up, calling trump, discarding, trick play, hand scoring, and next hand setup.
- [ ] Implement terminal and non-terminal state checks.
- [ ] Implement error handling for illegal or out-of-phase actions.

### Phase 5 - Serialization and Masked Views

- [ ] Implement `to_dict` or equivalent JSON-friendly export.
- [ ] Implement `from_dict` or equivalent state restoration.
- [ ] Implement `get_masked_state` for per-player hidden-information views.
- [ ] Ensure masked states preserve enough context for legal action selection.
- [ ] Ensure serialization is stable for ML pipelines and replay logs.

### Phase 6 - Testing and Validation

- [ ] Add unit tests for card ordering, effective suit logic, and trick resolution.
- [ ] Add unit tests for legal move generation across all phases.
- [ ] Add tests for deterministic replay from fixed seeds.
- [ ] Add tests for serialization round-trips.
- [ ] Add tests for masked-view correctness.
- [ ] Add scenario tests for complete hands and score progression.

### Phase 7 - Tooling and Quality Gates

- [ ] Add a test runner command and document it.
- [ ] Add lint and format tooling configuration.
- [ ] Add CI-ready commands for setup, lint, and tests.
- [ ] Add type hints throughout the codebase and run a type checker.
- [ ] Add simple fixtures or factories for test setup.

### Phase 8 - ML and Integration Readiness

- [ ] Add an API surface for agent-driven play loops.
- [ ] Add structured observations suitable for LLM or policy model inputs.
- [ ] Add action schemas suitable for downstream training or inference systems.
- [ ] Add replay logging or trajectory export for dataset generation.
- [ ] Verify compatibility assumptions for Pyodide or browser execution.

### Phase 9 - Documentation and Delivery

- [ ] Document public API usage with examples.
- [ ] Document game-state schema and masked-state schema.
- [ ] Document deterministic execution and seeding behavior.
- [ ] Document known rule assumptions and non-goals.
- [ ] Add a short implementation roadmap tying the phases above to delivery order.
