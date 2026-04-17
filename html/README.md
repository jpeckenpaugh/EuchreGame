# HTML Sandbox

This folder contains a browser UI for the local `EuchreGame` Python package.

It supports two execution modes:

- random legal move simulation
- optional AI-driven moves using a locally hosted Gemma LiteRT model asset

## Run It

From the repository root:

```bash
python3 -m http.server
```

Then open:

```text
http://127.0.0.1:8000/html/
```

## How It Works

- `index.html`, `style.css`, and `main.js` provide the UI.
- `main.js` loads a vendored local copy of Pyodide from `html/vendor/pyodide/`.
- `main.js` also loads a vendored local copy of MediaPipe GenAI from `html/vendor/tasks-genai/`.
- The local Python files from `../euchre_game/` are copied into Pyodide's in-memory filesystem.
- `python/game_bridge.py` handles game state, compact AI context formatting, and move application.
- Browser persistence uses IndexedDB for settings, metrics, and recent session metadata.

This means you do not need a frontend build step. A plain static server is enough.

## Local AI Assets

Model binaries are not committed to git. Place them locally under:

```text
html/vendor/models/
```

The UI defaults to `html/vendor/models/gemma-4-E2B-it-web.task`, but you can change the asset path
from the browser if your local filename differs or if you want to use a `.litertlm` variant instead.

To fetch the default model into that ignored path:

```bash
./scripts/download_gemma_model.sh
```

For the expected layout and git-ignore behavior, see
[docs/LOCAL_MODEL_SETUP.md](/Users/jarad/git/EuchreGame/docs/LOCAL_MODEL_SETUP.md).
