#!/bin/bash
set -Eeuo pipefail

GPT_ROOT="/opt/GPT-SoVITS"
GPT_PORT="${GPT_SOVITS_PORT:-9880}"
GPT_CONFIG="${GPT_SOVITS_CONFIG:-/app/tts-cpu.yaml}"

cleanup() {
  set +e
  [[ -n "${GPT_PID:-}" ]] && kill "$GPT_PID" 2>/dev/null || true
  [[ -n "${NODE_PID:-}" ]] && kill "$NODE_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting GPT-SoVITS CPU engine on 127.0.0.1:${GPT_PORT}"
cd "$GPT_ROOT"
/opt/conda/bin/conda run --no-capture-output -n gptsovits \
  python api_v2.py -a 127.0.0.1 -p "$GPT_PORT" -c "$GPT_CONFIG" &
GPT_PID=$!

cd /app
node server.mjs &
NODE_PID=$!

while true; do
  if ! kill -0 "$NODE_PID" 2>/dev/null; then
    wait "$NODE_PID"
    exit $?
  fi
  if ! kill -0 "$GPT_PID" 2>/dev/null; then
    echo "GPT-SoVITS process exited; shutting Support down so Railway can restart it." >&2
    wait "$GPT_PID" || true
    exit 1
  fi
  sleep 2
done
