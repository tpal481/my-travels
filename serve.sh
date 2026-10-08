#!/usr/bin/env bash
# Serve My Travels locally (needed for geolocation / service worker — file:// won't work well)
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-8080}"
echo "My Travels → http://127.0.0.1:${PORT}/"
echo "On a phone on the same network, use this machine's LAN IP instead of 127.0.0.1"
echo "Press Ctrl+C to stop."
exec python3 -m http.server "$PORT" --bind 0.0.0.0
