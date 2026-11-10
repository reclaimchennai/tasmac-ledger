#!/bin/bash
# Serves the built site. Production build, not `next dev` — dev mode recompiles
# on every request and leaks memory over days.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export NODE_ENV=production
# Build if there is no build yet, so a fresh clone or a wiped .next self-heals.
[ -d .next/BUILD_ID ] || [ -f .next/BUILD_ID ] || npm run build
exec npx next start -p 3000 -H 0.0.0.0
