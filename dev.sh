#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

if docker info >/dev/null 2>&1; then
    DOCKER=1
    echo "==> Starting postgres..."
    docker compose -f "$ROOT/docker-compose.yml" up postgres -d
    MVN_ARGS=(spring-boot:run)
else
    DOCKER=0
    echo "==> Docker unavailable; using embedded Postgres (backend/.localdb)"
    MVN_ARGS=(-Pembedded-db spring-boot:run -Dspring-boot.run.profiles=embedded-db)
fi

echo "==> Starting backend (logs -> backend.log)..."
cd "$ROOT/backend"
./mvnw "${MVN_ARGS[@]}" > "$ROOT/backend.log" 2>&1 &
BACKEND_PID=$!

cleanup() {
    echo ""
    echo "==> Stopping backend and postgres..."
    kill "$BACKEND_PID" 2>/dev/null || true
    [ "$DOCKER" = 1 ] && docker compose -f "$ROOT/docker-compose.yml" stop postgres
    echo "Done."
}
trap cleanup EXIT INT TERM

echo "==> Starting frontend (http://localhost:5173)..."
cd "$ROOT/frontend"
npm run dev
