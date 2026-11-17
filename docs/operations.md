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
- `SYNC_CRON`: optional override of the nightly schedule
- Auto-deploys on push to master

**Frontend**:
- Nginx listens on `${PORT}` (Railway injects this at runtime)
- `nginx/templates/default.conf.template` uses `envsubst` to replace `$PORT` and `$BACKEND_URL` at container startup
- Never hardcode port 80 in nginx config

## Sync schedule

Scheduled: `0 0 4 * * *` America/New_York (4 AM ET, respects DST), overridable via `SYNC_CRON`.

## Cache warm after deploy

**After a deploy or Railway restart**, caches are cold. Hit `POST /api/admin/cache/warm` from the Admin page; poll `/api/admin/cache/warm/status` for progress. Target: <60s for a full warm.
