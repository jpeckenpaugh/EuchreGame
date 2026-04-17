# Local Model Libraries

Place the model WebGPU/WebAssembly library here.

The browser demo defaults to looking for:

```text
html/vendor/model-libs/gemma-4-2b-it-int4-webgpu.wasm
```

If your generated `.wasm` filename differs, update the field in the browser UI. Keep the
binary out of git; `.gitignore` is configured to ignore files in this directory except this
README and `.gitkeep`.

