#!/bin/bash
#
# Install, remove and inspect the launchd agents that keep this thing alive.
#
# Four agents, all user-level (no root, no password): the harvester, the bot, the
# site, and the Cloudflare tunnel. Each has RunAtLoad and KeepAlive, so they come
# back after a crash and after the laptop restarts — launchd starts user agents at
# login, so an unattended reboot needs the Mac to reach the desktop.
#
#   ./scripts/services.sh install     write the plists and start everything
#   ./scripts/services.sh uninstall   stop and remove them
#   ./scripts/services.sh status      what is running, and the public URL
#   ./scripts/services.sh restart     bounce all four
#   ./scripts/services.sh logs        tail everything
#
set -euo pipefail

PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
PREFIX="in.tasmac.ledger"
SERVICES=(watch bot site tunnel)
UID_NUM="$(id -u)"

plist_path() { echo "$AGENTS/$PREFIX.$1.plist"; }

write_plist() {
  local name="$1" script="$2" throttle="$3"
  cat > "$(plist_path "$name")" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$PREFIX.$name</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$PROJECT/scripts/$script</string>
  </array>
  <key>WorkingDirectory</key><string>$PROJECT</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>$throttle</integer>
  <key>StandardOutPath</key><string>$PROJECT/logs/$name.log</string>
  <key>StandardErrorPath</key><string>$PROJECT/logs/$name.log</string>
  <key>ProcessType</key><string>Background</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>TASMAC_DB</key><string>$PROJECT/data/tasmac.db</string>
    <key>NODE_ENV</key><string>production</string>
  </dict>
</dict>
</plist>
PLIST
}

case "${1:-status}" in
  install)
    mkdir -p "$AGENTS" "$PROJECT/logs"

    # Anything already running by hand would fight the agents for the port and
    # the Telegram long poll, so clear those out first.
    pkill -f "tsx src/scraper/watch.ts" 2>/dev/null || true
    pkill -f "tsx src/bot/index.ts" 2>/dev/null || true
    pkill -f "next dev" 2>/dev/null || true
    sleep 2

    write_plist watch  run-watch.sh  30
    write_plist bot    run-bot.sh    15
    write_plist site   run-site.sh   15
    write_plist tunnel run-tunnel.sh 15

    for s in "${SERVICES[@]}"; do
      launchctl bootout "gui/$UID_NUM/$PREFIX.$s" 2>/dev/null || true
      launchctl bootstrap "gui/$UID_NUM" "$(plist_path "$s")"
      launchctl enable "gui/$UID_NUM/$PREFIX.$s"
      echo "loaded  $PREFIX.$s"
    done
    echo
    echo "Installed. They will restart on crash and at login."
    ;;

  uninstall)
    for s in "${SERVICES[@]}"; do
      launchctl bootout "gui/$UID_NUM/$PREFIX.$s" 2>/dev/null || true
      rm -f "$(plist_path "$s")"
      echo "removed $PREFIX.$s"
    done
    ;;

  restart)
    for s in "${SERVICES[@]}"; do
      launchctl kickstart -k "gui/$UID_NUM/$PREFIX.$s" 2>/dev/null && echo "restarted $s" || echo "not loaded: $s"
    done
    ;;

  status)
    printf '%-10s %-8s %-8s %s\n' SERVICE PID EXIT STATE
    for s in "${SERVICES[@]}"; do
      line="$(launchctl list | awk -v l="$PREFIX.$s" '$3==l {print $1, $2}')"
      if [ -z "$line" ]; then
        printf '%-10s %-8s %-8s %s\n' "$s" '-' '-' 'not loaded'
      else
        pid="${line%% *}"; ex="${line##* }"
        printf '%-10s %-8s %-8s %s\n' "$s" "$pid" "$ex" "$([ "$pid" != '-' ] && echo running || echo stopped)"
      fi
    done
    echo
    if [ -f "$PROJECT/data/tunnel-url.txt" ]; then
      echo "public URL: $(cat "$PROJECT/data/tunnel-url.txt")"
    else
      echo "public URL: not published yet"
    fi
    echo -n "local site: "
    curl -s -o /dev/null -w '%{http_code}\n' --max-time 5 http://localhost:3000/ || echo 'unreachable'
    if [ -f "$PROJECT/data/tasmac.db" ]; then
      sqlite3 "$PROJECT/data/tasmac.db" \
        "SELECT 'last reading: ' || COALESCE(MAX(started_at),'never') || '  (' || COUNT(*) || ' total)' FROM snapshot WHERE status='ok';" 2>/dev/null || true
    fi
    ;;

  logs)
    tail -n 40 -f "$PROJECT"/logs/*.log
    ;;

  *)
    echo "usage: $0 {install|uninstall|restart|status|logs}" >&2
    exit 1
    ;;
esac
