# HTML Sandbox

This folder contains a browser UI for the local `EuchreGame` Python package.

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
- The local Python files from `../euchre_game/` are copied into Pyodide's in-memory filesystem.
- `python/game_bridge.py` runs the random-move controller and returns JSON snapshots for rendering.

This means you do not need a frontend build step. A plain static server is enough.
