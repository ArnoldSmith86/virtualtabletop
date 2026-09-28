#!/usr/bin/env bash

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/vtt" || exit 1

export VTT_SAVE_DIR="${VTT_SAVE_DIR:-$HOME/.virtualtabletop}"
mkdir -p "$VTT_SAVE_DIR/assets" || exit 1

port="${PORT:-$(node -e 'const fs = require("fs"); const file = fs.existsSync("config.json") ? "config.json" : "config.template.json"; process.stdout.write(String(JSON.parse(fs.readFileSync(file)).port))')}"
url="http://localhost:$port"

node server.mjs &
server_pid=$!

cleanup() {
  trap - EXIT
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 0' HUP INT TERM

ready=0
for ((attempt = 0; attempt < 120; attempt++)); do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    wait "$server_pid"
    exit $?
  fi
  if (echo > "/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    ready=1
    break
  fi
  sleep 0.5
done
if [[ "$ready" != 1 ]]; then
  echo "VirtualTabletop did not start on port $port." >&2
  exit 1
fi

echo "VirtualTabletop: $url"
echo "If your browser doesn't open, open $url in your browser."
echo 'Keep this window open while playing; close it or press Ctrl+C to stop VirtualTabletop.'
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$url" >/dev/null 2>&1 &
fi

wait "$server_pid"
