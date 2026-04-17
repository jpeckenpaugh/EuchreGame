# Local Model Assets

Place your local LiteRT browser model file in this folder.

The browser demo defaults to looking for:

```text
html/vendor/models/gemma-4-E2B-it-web.task
```

You can also point the UI at another LiteRT-compatible file such as:

- `gemma-4-E4B-it-web.task`
- a `.litertlm` file

You can change the model path from the browser UI if your local filename differs.

To download the default Gemma 4 E2B browser model into this folder:

```bash
./scripts/download_gemma_model.sh
```

Files placed here stay local because `html/vendor/models/` is ignored by git.
