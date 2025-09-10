#!/usr/bin/env bash
set -euo pipefail

# -------------------------------------------------------------------------------------------------
# start-frontend.sh
#
# What:
#   Starts the React/Vite frontend dev server located under ./frontend.
#
# How:
#   Runs `npm run dev` in the frontend directory. Expects dependencies to be installed already.
#
# Parameters (environment variables):
#   - No required params. If you need a different port, you can run `npm run dev -- --port <PORT>`
#     by editing this script or running the command manually in ./frontend.
#
# Returns:
#   This script replaces itself with the dev server (exec). Exit code is the dev server's exit code.
# -------------------------------------------------------------------------------------------------

# Move to the frontend directory relative to repo root
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR/frontend"

if [[ ! -d node_modules ]]; then
  echo "[start-frontend] node_modules not found."
  echo "[start-frontend] Please install dependencies first:"
  echo "    cd frontend && npm ci"
  exit 1
fi

echo "[start-frontend] Starting Vite dev server in $(pwd) ..."
echo "[start-frontend] Node: $(node -v 2>/dev/null || echo 'not found')  NPM: $(npm -v 2>/dev/null || echo 'not found')"
echo "---"

# Exec the dev server so Ctrl+C terminates it cleanly
exec npm run dev

