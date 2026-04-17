# Local Model Setup

The browser sandbox supports local WebLLM model loading without committing large binaries to git.

## Expected Layout

By default, the UI looks for:

```text
html/vendor/models/gemma-4-2b-it-int4/
html/vendor/model-libs/gemma-4-2b-it-int4-webgpu.wasm
```

The model directory should contain the usual MLC/WebLLM model artifacts, including
`mlc-chat-config.json` and tokenizer/config files.

## Git Behavior

Large files under these paths are ignored by git:

- `html/vendor/models/`
- `html/vendor/model-libs/`

Only the placeholder docs and `.gitkeep` files are tracked.

## Browser Caching

The browser app can configure WebLLM to cache model assets in IndexedDB between page loads.
This is controlled from the UI and defaults to IndexedDB for the AI path.

The app also stores:

- AI settings
- baseline metrics
- recent session metadata

in its own IndexedDB database so state survives reloads.

## Workflow

1. Place the local model assets and model library under the ignored `html/vendor/` folders.
2. Run `python3 -m http.server` from the repo root.
3. Open `http://127.0.0.1:8000/html/`.
4. Adjust model path and model wasm path in the UI if your filenames differ.
5. Click `Load AI`.

