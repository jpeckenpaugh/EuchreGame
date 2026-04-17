# Legacy Model Libraries

This folder is kept only for older local WebLLM experiments.

The current browser demo no longer loads a separate WebGPU/WebAssembly model library from this
path. It now uses MediaPipe GenAI with a single local LiteRT model asset from
`html/vendor/models/`.

The directory remains ignored by git so any legacy local binaries here still stay out of the
repository.
