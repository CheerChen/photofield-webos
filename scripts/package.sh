#!/usr/bin/env bash
# Build the release IPK from a clean staging directory (same rationale as
# navidrome-stage: ares-package on the repo root would ship .git, scripts,
# tests and screenshots).
set -euo pipefail

APP_ID="com.cheerchen.photofield"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE="$(mktemp -d)/${APP_ID}"
trap 'rm -rf "$(dirname "$STAGE")"' EXIT

mkdir -p "$STAGE/assets"
cd "$ROOT"
cp appinfo.json index.html "$STAGE/"
cp -R js css "$STAGE/"
cp -R assets/icons "$STAGE/assets/"
cp -R assets/audio "$STAGE/assets/"
cp assets/splash.png "$STAGE/assets/" 2>/dev/null || true
find "$STAGE" -name ".DS_Store" -delete

# -n skips minification: the sources are plain unminified scripts and the
# bundled minifier breaks them.
ares-package "$STAGE" -n -o "$ROOT"

VERSION="$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' appinfo.json | head -1)"
IPK="$ROOT/${APP_ID}_${VERSION}_all.ipk"
printf '\n%s\n' "$IPK"
ls -lh "$IPK" | awk '{print "size:   " $5}'
shasum -a 256 "$IPK" | awk '{print "sha256: " $1}'
