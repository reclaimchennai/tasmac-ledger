#!/bin/bash
# The harvester. Loops internally; launchd restarts it if it ever exits.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
exec npx tsx src/scraper/watch.ts --every=20
