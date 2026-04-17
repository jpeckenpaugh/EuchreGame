# Local Model Setup

The browser sandbox supports local Gemma LiteRT model loading without committing large binaries to
git.

## Expected Layout

By default, the UI looks for:

```text
html/vendor/models/gemma-4-E2B-it-web.task
```

You can also point the UI at another local LiteRT-compatible model file such as:

- `gemma-4-E4B-it-web.task`
- a `.litertlm` file from the LiteRT community model pages

The browser app now uses the vendored MediaPipe GenAI runtime under `html/vendor/tasks-genai/`,
not the older WebLLM `model` + `model_lib` split.

## Git Behavior

Large files under these paths are ignored by git:

- `html/vendor/models/`

Only the placeholder docs and `.gitkeep` files are tracked.

## Browser Caching

The app also stores:

- AI settings
- baseline metrics
- recent session metadata

in its own IndexedDB database so state survives reloads.

The model asset itself is expected to live on disk under `html/vendor/models/` and be served
locally by `python3 -m http.server`. Browser-level HTTP caching may still help between reloads,
but the app does not duplicate the multi-GB model file into IndexedDB.

## Suggested Downloads

If you want the same defaults the UI expects, use one of these official LiteRT community files:

- `litert-community/gemma-4-E2B-it-litert-lm` -> `gemma-4-E2B-it-web.task`
- `litert-community/gemma-4-E4B-it-litert-lm` -> `gemma-4-E4B-it-web.task`

## Workflow

1. Download or place the local `.task` or `.litertlm` model file under the ignored `html/vendor/models/` folder.
2. Run `python3 -m http.server` from the repo root.
3. Open `http://127.0.0.1:8000/html/`.
4. Adjust the model asset path in the UI if your filename differs from the default.
5. Click `Load AI`.

## Download Script

The repository includes a helper script for the default Gemma 4 browser assets:

```bash
./scripts/download_gemma_model.sh
```

By default this downloads the official E2B web task file to:

```text
html/vendor/models/gemma-4-E2B-it-web.task
```

It also verifies the pinned SHA-256 checksum for that file.

You can optionally request the E4B variant instead:

```bash
./scripts/download_gemma_model.sh e4b
```

The download target remains ignored by git, so running the script does not introduce the large
binary into commits.
