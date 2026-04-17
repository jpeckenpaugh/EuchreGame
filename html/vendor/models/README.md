# Local Model Assets

Place your local MLC/WebLLM model artifact directory in this folder.

The browser demo defaults to looking for:

```text
html/vendor/models/gemma-4-2b-it-int4/
```

That model directory should contain the usual MLC/WebLLM artifacts such as:

- `mlc-chat-config.json`
- tokenizer files
- `ndarray-cache.json`
- parameter shard binaries

You can change the model path from the browser UI if your local directory name differs.

