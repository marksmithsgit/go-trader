#!/usr/bin/env bash
set -euo pipefail

# -------------------------------------------------------------------------------------------------
# start-backend.sh
#
# What:
#   Starts the Go trading backend (the HTTP/WebSocket server under cmd/trading-system).
#
# How:
#   Uses `go run ./cmd/trading-system` so you get live code reloading on restart and readable logs.
#   The server binds to GOTRADER_ADDR (default ":8080").
#
# Parameters (environment variables):
#   - GOTRADER_ADDR: address:port to bind the backend (default ":8080"). Example: "0.0.0.0:8080".
#
# Returns:
#   This script replaces itself with the running server (exec). Exit code is the server's exit code.
# -------------------------------------------------------------------------------------------------

# Move to repository root (this script is created at the repo root)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

export GOTRADER_ADDR="${GOTRADER_ADDR:-:8080}"

echo "[start-backend] Starting Go backend on ${GOTRADER_ADDR}..."
echo "[start-backend] Tip: export GOTRADER_ADDR=0.0.0.0:8080 to bind on all interfaces"
echo "[start-backend] Working dir: $(pwd)"
echo "[start-backend] go version: $(go version)"
echo "---"

# Exec the server so Ctrl+C terminates it cleanly
exec go run ./cmd/trading-system

