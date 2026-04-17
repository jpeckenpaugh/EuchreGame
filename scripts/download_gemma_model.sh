#!/usr/bin/env bash

set -euo pipefail

MODEL_VARIANT="${1:-e2b}"
OUTPUT_PATH="${2:-}"

case "${MODEL_VARIANT}" in
  e2b)
    MODEL_URL="https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.task?download=true"
    DEFAULT_OUTPUT="html/vendor/models/gemma-4-E2B-it-web.task"
    EXPECTED_SHA256="2cbff161177a4d51c9d04360016185976f504517ba5758cd10c1564e5421c5a5"
    ;;
  e4b)
    MODEL_URL="https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.task?download=true"
    DEFAULT_OUTPUT="html/vendor/models/gemma-4-E4B-it-web.task"
    EXPECTED_SHA256=""
    ;;
  *)
    echo "Unsupported model variant: ${MODEL_VARIANT}" >&2
    echo "Usage: $0 [e2b|e4b] [output_path]" >&2
    exit 1
    ;;
esac

TARGET_PATH="${OUTPUT_PATH:-${DEFAULT_OUTPUT}}"
TARGET_DIR="$(dirname "${TARGET_PATH}")"

mkdir -p "${TARGET_DIR}"

echo "Downloading ${MODEL_VARIANT} model to ${TARGET_PATH}"
curl -L -C - --fail --output "${TARGET_PATH}" "${MODEL_URL}"

if [[ -n "${EXPECTED_SHA256}" ]]; then
  if command -v shasum >/dev/null 2>&1; then
    ACTUAL_SHA256="$(shasum -a 256 "${TARGET_PATH}" | awk '{print $1}')"
  elif command -v sha256sum >/dev/null 2>&1; then
    ACTUAL_SHA256="$(sha256sum "${TARGET_PATH}" | awk '{print $1}')"
  else
    echo "Downloaded, but no SHA-256 tool was found to verify the file." >&2
    exit 0
  fi

  if [[ "${ACTUAL_SHA256}" != "${EXPECTED_SHA256}" ]]; then
    echo "SHA-256 mismatch for ${TARGET_PATH}" >&2
    echo "Expected: ${EXPECTED_SHA256}" >&2
    echo "Actual:   ${ACTUAL_SHA256}" >&2
    exit 1
  fi

  echo "Verified SHA-256: ${ACTUAL_SHA256}"
else
  echo "Downloaded ${TARGET_PATH}. No pinned checksum is configured for ${MODEL_VARIANT}."
fi

echo "Done. The file remains local-only because html/vendor/models/ is ignored by git."
