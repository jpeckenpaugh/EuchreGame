# 🃏 EuchreGame — Python Euchre Engine, Pyodide Sandbox & LLM Data Factory

> **Play Partnership Euchre in Your Browser (Powered by Pyodide) or Distill Synthetic Training Data** — A deterministic 24-card Python Euchre engine running client-side in WebAssembly alongside an offline LLM teacher-data factory.

[![Play Now on GitHub Pages](https://img.shields.io/badge/▶_PLAY_SANDBOX-EuchreGame-10b981?style=for-the-badge)](https://euchre.livive.net/)

---

## 🎮 Play in the Browser Sandbox (`https://euchre.livive.net/`)

- **In-Browser Python Engine via Pyodide:** Click **New Match**, step trick-by-trick with **Next Move**, or toggle **Auto Play** (`Slow` / `Normal` / `Fast`) to watch 4-player partnership Euchre (North/South vs. East/West) with full Left/Right Bower trump rules.
- **God View vs. Masked Seat Views:** Switch the **View** selector between `God View` (all 4 hands visible) and `Player 0–3` to inspect the exact hidden-information state JSON exported to AI agents.
- **Local Gemma WebLLM Mode & Synthetic Data Factory:** Connect a local Gemma model in-browser or run the `factory/` pipeline to generate validated gold JSONL trajectories for student-model distillation.

---

## 🛠️ For Developers (The Other 10%)

### 1. Setup Virtual Environment & Tests
```bash
./scripts/setup_venv.sh
source .venv/bin/activate
pytest
python scripts/smoke_test.py
```

### 2. Run Browser Sandbox Locally
```bash
python3 -m http.server 4173
```
Then open `http://127.0.0.1:4173/html/`.

### 3. Training Data Factory
```bash
python -m factory.cli --help
```

### 4. Showcase Test Runner
```bash
./test-runner/run.sh --showcase
```

---

## Project Layout

```text
euchre_game/         Package source
factory/             Data Factory pipeline, benchmark runner, and local dashboard
html/                Browser UI sandbox powered by Pyodide
docs/                Architecture, local model setup, and roadmap notes
scripts/             Bootstrap and smoke-test scripts
tests/               Pytest coverage
test-runner/         Playwright headless browser showcase & recording suite
requirements.txt     Runtime dependency list
requirements-dev.txt Development and verification dependencies
pyproject.toml       Package metadata and tool configuration
```
