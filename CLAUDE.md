# rzs-stats

A stats dashboard for a private Madden fantasy football league (Red Zone Sports). Pulls game data from the NeonSportz REST API, computes advanced analytics (PyPAT win expectancy, Luck, Strength of Schedule), and serves them through an interactive React frontend.

**The ethos**: surface the truth behind the scoreboard.

## Stack

| Layer | Tech |
|-------|------|
| Backend | Spring Boot 3.3.4 / Java 21 |
| Database | PostgreSQL (Caffeine cache layer on top) |
| Frontend | React 18 / Vite / Tailwind CSS / Recharts |
| Web server | Nginx (frontend container) |
| Hosting | Railway — `redzone.up.railway.app` (frontend), `rzs-stats-production.up.railway.app` (backend) |
| Data source | NeonSportz REST API (`neonsportz.com/api/leagues/RZS/`) |

## Architecture

Spring Boot controllers expose public stats and QB APIs plus token-gated admin tools.
Services sync NeonSportz data into PostgreSQL, compute analytics, and cache reads with Caffeine.
The React frontend calls those APIs; Nginx serves the frontend container on Railway.

## Essential commands

```bash
./dev.sh                    # backend + frontend together; uses Docker Postgres, or embedded if Docker is missing

# Backend (from backend/)
./mvnw spring-boot:run      # runs on :8080
./mvnw test                 # all backend tests
./mvnw -Pembedded-db spring-boot:run -Dspring-boot.run.profiles=embedded-db   # no Docker: in-process Postgres

# Frontend (from frontend/)
npm run dev                 # runs on :5173, proxies /api → :8080
npm test -- --run           # vitest
```

Setup details, ports, database credentials, and overrides: [Operations](docs/operations.md).

## Critical rules

### Queries and caching

- Every game-loading JPQL query must include `LEFT JOIN FETCH g.homeTeam LEFT JOIN FETCH g.awayTeam` to prevent N+1 queries.
- Every new cache must be added to `CacheNames.java` in the `allStatsCaches` resolver or it silently survives eviction.

### Indexing and game identity

- Season index is 0-based; display the league season number with `seasonLabel` (`index + 103`).
- `stageIndex`: 0 = preseason, 1 = regular season + playoffs; playoffs are weeks 18+.
- QB endpoints use the named `stage` enum (`regular`, `playoffs`, `both`), versus numeric `stageIndex` elsewhere; `stage=1` to a QB endpoint returns 400.
- Game `status >=2` = completed and counted; `<2` = unplayed/future.
- Use `nsPk` for NeonSportz URLs; `gameId` is only for deduplication.

### Missing data and sync

- SoS values are nullable, including SoS Played; null means no data and is not 0.0.
- QB sync is separate (`POST /api/admin/sync/qb`); the QB leaderboard stays empty until it runs.

### Frontend consistency

- Update `AboutPage` whenever adding a stat or page; it is the user-facing contract for every number.
- Tier thresholds, colors and `lean()` live only in `utils/eloLean.js`; Home and Elo share them.

## Security and deployment

### Admin access

- `ADMIN_TOKEN` unset = admin routes wide open; always set it in deployed environments.

### Railway configuration

- `DATABASE_URL` must be JDBC format; Spring rejects Railway's default `postgres://` URL.
- Never hardcode port 80 in nginx; Railway injects `${PORT}` at runtime.
- The backend auto-deploys on push to master.

## Documentation index

Read only the docs relevant to the current task.

- Frontend/UI work → [Frontend](docs/frontend.md).
- Elo/stat calculations → [Statistics](docs/statistics.md).
- Backend/API/schema/cache/sync → [Architecture](docs/architecture.md).
- Deployment/env/local setup issues → [Operations](docs/operations.md).
- Writing or running tests → [Testing](docs/testing.md).
- Original Elo specification → [Elo ratings implementation](docs/elo-ratings-implementation.md).
