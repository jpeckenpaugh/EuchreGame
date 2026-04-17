# EuchreGame

`EuchreGame` is a headless Python package for deterministic Euchre simulation with AI/ML-friendly state export. The repository now also includes a local training-data factory for generating, validating, benchmarking, and reviewing synthetic Euchre decision data for student-model distillation.

Design and roadmap notes now live in:

- [docs/ARCHITECTURE.md](/Users/jarad/git/EuchreGame/docs/ARCHITECTURE.md)
- [docs/LOCAL_MODEL_SETUP.md](/Users/jarad/git/EuchreGame/docs/LOCAL_MODEL_SETUP.md)
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
- a local Data Factory pipeline for synthetic teacher-data generation
- a benchmark runner for measuring response quality and throughput over decision states
- a local dashboard for launching jobs, browsing JSONL artifacts, and recording manual reviews
- a browser-based HTML sandbox that runs the Python engine through Pyodide
- optional AI-driven browser play using a locally hosted Gemma 4 LiteRT model asset
- IndexedDB-backed persistence for browser settings, baseline metrics, and session metadata

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
factory/             Data Factory pipeline, benchmark runner, and local dashboard
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

## Training Data Factory

The repository includes a local synthetic-data pipeline under `factory/` for distillation-style
training workflows. The factory is designed around decision-state collection, teacher inference,
legal-move validation, and training-ready JSONL export.

### Factory Components

- `factory/gen_scenarios.py`
  - simulates games and captures masked decision states
- `factory/generate_trajectories.py`
  - queries the local Ollama-served teacher model
- `factory/filter_gold_data.py`
  - validates outputs and writes gold training rows
- `factory/run_pipeline_job.py`
  - runs an end-to-end job into a per-run output folder
- `factory/run_benchmark.py`
  - benchmarks throughput and quality across many decision responses
- `factory/server.py`
  - FastAPI backend for the local dashboard
- `factory/web/`
  - static HTML/JS review and job-launch UI

### Current Data Strategy

The current factory flow is optimized for student-model training rather than full play-trace
coverage:

- only decision states are kept by default
- forced states with a single legal move are skipped
- the teacher prompt is constrained to short, grounded reasoning from visible masked-state facts
- final gold rows are written only for parse-valid, legal responses

### Factory Output Artifacts

Depending on the entry point, the factory writes artifacts such as:

- `scenarios.jsonl`
- `raw_responses.jsonl`
- `validated_rows.jsonl`
- `gold_dataset.jsonl`
- `rejected_rows.jsonl`
- `benchmark_summary.json`

Per-job outputs live under `factory/output/jobs/`. Benchmark runs live under
`factory/output/benchmarks/`.

### Windows-Friendly Venv Setup

For the local AMD Windows machine used for teacher inference:

```powershell
.\factory\setup_venv.ps1
```

That creates `.venv` and installs both the runtime dependencies and the development tools used by
the factory and dashboard.

### Run the Factory Dashboard

Start the FastAPI dashboard locally:

```powershell
.\factory\start_dashboard.ps1
```

Then open:

```text
http://127.0.0.1:8001/
```

The dashboard can:

- launch small generation jobs
- inspect saved JSONL files
- browse individual rows
- record manual validation decisions

### Run a Benchmark

Example benchmark run for `100` decision responses:

```powershell
.\.venv\Scripts\python.exe -m factory.run_benchmark --target-responses 100 --concurrency 1
```

This writes a benchmark folder under `factory/output/benchmarks/` containing the raw responses,
validated rows, gold dataset, and benchmark summary metrics.

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

### Local AI Mode

The browser UI now includes an optional Gemma/LiteRT path that:

- loads MediaPipe GenAI from a vendored local runtime under `html/vendor/tasks-genai/`
- expects a local `.task` or `.litertlm` model asset under the ignored `html/vendor/models/` folder
- uses IndexedDB-backed persistence for browser settings, AI baseline metrics, and session metadata
- keeps the large model binary out of git while still serving it locally through `http.server`

Large model binaries are intentionally kept out of git. Setup details are in
[docs/LOCAL_MODEL_SETUP.md](/Users/jarad/git/EuchreGame/docs/LOCAL_MODEL_SETUP.md).

To fetch the default Gemma 4 E2B browser model into the ignored local path:

```bash
./scripts/download_gemma_model.sh
```

That script downloads to `html/vendor/models/gemma-4-E2B-it-web.task`, verifies the pinned
SHA-256 for the default E2B asset, and leaves the file untracked by git.

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

For AI verification, the UI should:

- stay fully usable in random mode when local model assets are absent
- show a clear missing-asset error when `Load AI` is pressed without `html/vendor/models/gemma-4-E2B-it-web.task`
- load the configured local LiteRT model once the file path is populated correctly

## Next Work

The remaining implementation plan is tracked in
[docs/ROADMAP.md](/Users/jarad/git/EuchreGame/docs/ROADMAP.md).
