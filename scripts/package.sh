#!/usr/bin/env bash
# Thin wrapper over the shared IPK build (tvkit/scripts/package-common.sh):
# staging, payload/size gates, ares-package -n. The size ceiling mostly guards
# the bundled lofi MP3s under assets/audio.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

exec "$ROOT/tvkit/scripts/package-common.sh" \
  --app-id com.cheerchen.photofield \
  --root "$ROOT" \
  --max-kb 102400 \
  --contents scripts/ipk-contents.txt \
  "$@" \
  -- appinfo.json index.html js css assets/icons assets/audio assets/splash.png \
     tvkit/js/webos-platform.js
