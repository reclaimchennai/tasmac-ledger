#!/bin/bash
# Cloudflare quick tunnel. Publishes the current public URL to data/tunnel-url.txt
# so the bot can pick it up without a restart — a quick tunnel gets a new
# hostname every time it reconnects, and links must not go stale.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

URL_FILE="data/tunnel-url.txt"
LOG="logs/tunnel-raw.log"
: > "$LOG"

cloudflared tunnel --no-autoupdate --url http://localhost:3000 2>&1 | tee -a "$LOG" | while IFS= read -r line; do
  # cloudflared prints the assigned hostname once, inside a banner box.
  if [[ "$line" =~ (https://[a-z0-9-]+\.trycloudflare\.com) ]]; then
    echo "${BASH_REMATCH[1]}" > "$URL_FILE"
    echo "[tunnel] public URL: ${BASH_REMATCH[1]}"
  fi
done
