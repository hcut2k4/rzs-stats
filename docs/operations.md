# Operations

## Dev Setup

```bash
./dev.sh                    # backend + frontend together; uses Docker Postgres, or embedded if Docker is missing

# Or run them separately:
docker compose up -d postgres

# Backend (from backend/)
./mvnw spring-boot:run      # runs on :8080
./mvnw test                 # all backend tests

# Frontend (from frontend/)
npm run dev                 # runs on :5173, proxies /api → :8080
npm test -- --run           # vitest
```

Local DB: `jdbc:postgresql://localhost:5432/rzs_stats`, user `postgres`, password `postgres`.

**No Docker?** The `embedded-db` Maven profile runs an in-process Postgres under `backend/.localdb`:

```bash
./mvnw -Pembedded-db spring-boot:run -Dspring-boot.run.profiles=embedded-db
```

**Ports already taken?** Override both sides — the Vite proxy target is an env var:

```bash
./mvnw -Pembedded-db spring-boot:run -Dspring-boot.run.profiles=embedded-db \
  -Dspring-boot.run.arguments=--server.port=8090
BACKEND_URL=http://localhost:8090 npx vite --port 5180 --strictPort
```

The embedded DB starts empty. Sync from the Admin page, or `POST /api/admin/sync`, before the UI shows anything.

## Deployment (Railway)

**Backend**:
- `DATABASE_URL` must be JDBC format — construct manually:
  `jdbc:postgresql://${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}`
- Railway's default `DATABASE_URL` is a postgres:// URL — Spring rejects it
- `ALLOWED_ORIGINS`: set to the frontend Railway URL
- `ADMIN_TOKEN`: **must be set**, or every `/api/admin/**` route is unauthenticated
- `SYNC_CRON`: optional override of the nightly FULL reconciliation schedule
- `SYNC_INTERVAL_MINUTES`: initial polling interval in minutes (default 120); any whole number from 0 (off) to 10080. The persisted admin setting takes precedence after creation.
- Auto-deploys on push to master

**Frontend**:
- Nginx listens on `${PORT}` (Railway injects this at runtime)
- `nginx/templates/default.conf.template` uses `envsubst` to replace `$PORT` and `$BACKEND_URL` at container startup
- Never hardcode port 80 in nginx config

## Sync schedule

A one-minute ticker checks the persisted interval. The default is 120 minutes; the Admin page takes any whole number of minutes from 1 to 10080 (0 turns it off) and shows last checked, last data change and next check. Off disables frequent polling; startup and nightly reconciliation still run.

The first run after startup is FULL and always warms empty caches. QUICK polls fetch league info and the current and previous stored stage-1 weeks. The current week is the earliest week with unplayed games; the previous week is the next lower stored week, including the playoff gap from 20 to 22. With no unplayed games, polling fetches the whole current season. Season, stage or league-week changes escalate to FULL.

Nightly FULL reconciliation runs at `0 0 4 * * *` America/New_York (4 AM ET, respects DST), overridable via `SYNC_CRON`. A busy nightly run remains due and retries on the ticker until a FULL succeeds. FULL reconciles teams and the current season, and imports empty historical seasons. Existing historical game corrections require manual Force sync. Deleted or superseded upstream games are not removed automatically.

Every poll checks database QB/team-stat gaps and retries failed weeks. Changed game weeks also refetch stats; FULL refreshes the current and previous stored weeks (or the latest two after season end). Games commit first, then each QB week commits, then changed data triggers one full cache eviction and warm. Idle polls retain caches. Team metadata changes and league purges also count as changes. The public last-sync timestamp remains the last successful game sync.

Sync, Force, verbose sync, QB sync, cache warming and probability backfill share one guard, reserved before async handoff. Busy admin calls return HTTP 409, "already running". The Admin page polls status until completion or failure.

This deployment assumes **one Railway backend instance**. Additional replicas would each poll and retain separate, potentially stale Caffeine caches.

## Cache warm after deploy

Startup FULL automatically warms caches, including team efficiency and seasonal playoff QB tables. `POST /api/admin/cache/warm` remains a manual override; poll `/api/admin/cache/warm/status` for progress. Target: <60s for a full warm.
