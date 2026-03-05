#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "==> Starting postgres..."
docker compose -f "$ROOT/docker-compose.yml" up postgres -d

echo "==> Starting backend (logs -> backend.log)..."
cd "$ROOT/backend"
./mvnw spring-boot:run > "$ROOT/backend.log" 2>&1 &
BACKEND_PID=$!

cleanup() {
    echo ""
    echo "==> Stopping backend and postgres..."
    kill "$BACKEND_PID" 2>/dev/null || true
    docker compose -f "$ROOT/docker-compose.yml" stop postgres
    echo "Done."
}
trap cleanup EXIT INT TERM

echo "==> Starting frontend (http://localhost:5173)..."
cd "$ROOT/frontend"
npm run dev
