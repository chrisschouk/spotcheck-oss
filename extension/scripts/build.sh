#!/usr/bin/env bash
set -euo pipefail

# Builds the Chrome Web Store zip: extension/dist/spotcheck-extension-<version>.zip
# Only the files the extension runs are included.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$(dirname "$SCRIPT_DIR")"

VERSION=$(grep '"version"' "$EXT_DIR/manifest.json" | head -1 | sed 's/.*"\([0-9][0-9.]*\)".*/\1/')
if [ -z "$VERSION" ]; then
  echo "Error: could not read version from manifest.json"
  exit 1
fi

OUTPUT_PATH="$EXT_DIR/dist/spotcheck-extension-${VERSION}.zip"
mkdir -p "$EXT_DIR/dist"
rm -f "$OUTPUT_PATH"

cd "$EXT_DIR"
zip -r -X "$OUTPUT_PATH" manifest.json background content icons lib popup -x "*.DS_Store"

echo "Built: $OUTPUT_PATH"
echo "Size: $(du -h "$OUTPUT_PATH" | cut -f1)"
