# rzs-stats

A stats dashboard for a private Madden fantasy football league (Red Zone Sports). Pulls game data from the NeonSportz REST API, computes advanced analytics (PyPAT win expectancy, Luck, Strength of Schedule), and serves them through an interactive React frontend.

**The ethos**: surface the truth behind the scoreboard. W-L records are noisy — one-score games are largely random. PyPAT and SoS cut through that noise to show who is actually playing well and who has been lucky. Every design decision (H2H exclusion in SoS, game-weighted SoS Total, prior-season default for active seasons) exists to minimize bias and maximize signal.

---

## Stack

| Layer | Tech |
|-------|------|
| Backend | Spring Boot 3.3.4 / Java 21 |
| Database | PostgreSQL (Caffeine cache layer on top) |
| Frontend | React 18 / Vite / Tailwind CSS / Recharts |
| Web server | Nginx (frontend container) |
| Hosting | Railway — `redzone.up.railway.app` (frontend), `rzs-stats-production.up.railway.app` (backend) |
| Data source | NeonSportz REST API (`neonsportz.com/api/leagues/RZS/`) |

---

## Dev Setup

```bash
# Start local Postgres
docker-compose up -d postgres   # or skip: ./dev.sh falls back to an embedded Postgres when Docker is missing

# Backend (from backend/)
./mvnw spring-boot:run      # runs on :8080
./mvnw test                 # all unit tests

# Frontend (from frontend/)
npm run dev                 # runs on :5173, proxies /api → :8080
npm test -- --run           # vitest
```

Local DB: `jdbc:postgresql://localhost:5432/rzs_stats`, user `postgres`, password `postgres`.

---

## Project Structure

```
backend/src/main/java/com/rzs/stats/
├── controller/
│   ├── StatsController.java       # public API: /api/*
│   └── AdminController.java       # admin tools: /api/admin/*
├── service/
│   ├── StatsService.java          # all stats computation (PyPAT, SoS, standings)
│   ├── SyncService.java           # NeonSportz data sync
│   └── CacheWarmingService.java   # background cache population
├── repository/
│   ├── GameRepository.java        # game queries (always JOIN FETCH teams)
│   └── TeamRepository.java        # team lookups by teamId or nsId
├── model/
│   ├── entity/  GameEntity, TeamEntity
│   ├── dto/     StandingDto, GameDto, TeamDto, SeasonWeekDto
│   └── ns/      NsGame, NsTeam, NsLeague (NeonSportz API response shapes)
├── client/  NeonSportzClient.java
├── scheduler/  SyncScheduler.java   # nightly @Scheduled cron
└── config/  WebConfig.java          # CORS

frontend/src/
├── App.jsx                # routes + nav
├── api/client.js          # all axios calls
└── pages/
    ├── StandingsPage.jsx  # main table — sortable, heatmap, SoS toggle, export
    ├── GamesPage.jsx      # game results by week
    ├── TrendsPage.jsx     # season history table + weekly PyPAT chart
    ├── AdminPage.jsx      # sync controls, cache warming
    └── AboutPage.jsx      # stat definitions, resources
```

---

## Key Concepts

### PyPAT (Pythagorean PAT Win Expectancy)
Win expectancy derived from scoring differential, not W-L record. Uses Chase Stuart's dynamic exponent.

```
base     = (pf + pa) / games
exponent = base ^ 0.251
pyPAT    = pf^exponent / (pf^exponent + pa^exponent)
```

Scale: 0–1. 0.5 = break-even. A team with 0.70 PyPAT would be expected to win 70% of games given their scoring margin.

### Luck
`winDiff = actual wins − (pyPAT × games)`

Positive = won more games than scoring margin predicted (lucky). Negative = deserved more wins. Normalizes over time — a strong predictor of regression or rebound.

### Strength of Schedule (SoS)
Average PyPAT of opponents, with two key refinements:

1. **H2H exclusion**: Each opponent's PyPAT is recalculated *removing games vs. the subject team*. Prevents circular bias — without this, strong teams would artificially lower their own SoS.

2. **Three columns**:
   - **SoS Played**: Opponents faced so far
   - **SoS Left**: Remaining opponents (from unplayed games)
   - **SoS Total**: Game-count-weighted average: `(SoS_Played × gamesPlayed + SoS_Left × gamesLeft) / totalGames`
     - **NOT a union average** — that approach lets weak played-only opponents drag Total below both Played and Left

3. **Toggle (active season only)**: Current-season vs prior-season opponent PyPAT. Prior season is the default — early in a season, current-season sample sizes are too small to be meaningful.

---

## Data Model

### GameEntity
| Field | Type | Notes |
|-------|------|-------|
| `gameId` | Integer | NeonSportz external ref ID — deduplication key |
| `nsPk` | Integer | NeonSportz PK — used in game recap URLs |
| `seasonIndex` | Integer | 0-based; display = league season number, index + 103 |
| `stageIndex` | Integer | 0 = preseason, 1 = regular season AND playoffs (playoffs are weeks 18+: wild card 18, divisional 19, conference 20, Super Bowl 22). The API `stage=2` param means playoffs and is mapped to stage 1, weeks 18+ |
| `weekIndex` | Integer | 0-based |
| `homeTeam` / `awayTeam` | TeamEntity | `@ManyToOne(EAGER)` — always JOIN FETCH |
| `homeScore` / `awayScore` | Integer | null if not yet played |
| `status` | Integer | ≥2 = completed; <2 = unplayed |
| `simmed` | Boolean | true if game was simmed (not played by users) |

Unique constraint: `(seasonIndex, gameId)`. Indexes on `(seasonIndex, stageIndex, weekIndex)`, `homeTeam`, `awayTeam`.

### TeamEntity
`teamId` (business key), `nsId`, `displayName`, `nickname`, `cityName`, `abbrName`, `conference`, `division`, `primaryColor`, `logoId`.

Logos served from ESPN CDN: `https://a.espncdn.com/i/teamlogos/nfl/500/{ABBR}.png`

### StandingDto (key fields)
Record stats: `wins`, `losses`, `ties`, `gamesPlayed`, `winPct`, `pointsFor`, `pointsAgainst`
Advanced: `pythagoreanPat`, `winDiff` (Luck)
SoS: `oppPyPatCurr/Prev`, `oppPyPatRemainingCurr/Prev`, `oppPyPatTotalCurr/Prev`

---

## API Endpoints

### Public — `StatsController (/api)`
| Method | Path | Params | Returns |
|--------|------|--------|---------|
| GET | `/seasons` | — | `List<Integer>` — seasons with ≥10 games |
| GET | `/standings` | `season` | `List<StandingDto>` sorted by win% |
| GET | `/games` | `season`, `stage` (default 1), `week` | `List<GameDto>` |
| GET | `/games/weeks` | `season`, `stage` (default 1) | `List<Integer>` available weeks |
| GET | `/trends/season` | — | All seasons, all teams |
| GET | `/trends/weekly` | `season` | Week-by-week progression for one season |

### Admin — `AdminController (/api/admin)`
| Method | Path | Notes |
|--------|------|-------|
| POST | `/sync` | Incremental sync — skips historical seasons |
| POST | `/sync/force` | Re-syncs all seasons (~30 min, heavy API load) |
| POST | `/sync/verbose` | Sync with detailed per-game log (synchronous) |
| GET | `/sync/status` | `{lastSyncTime, lastSyncMessage, lastSyncSuccess}` |
| POST | `/cache/warm` | Evict all caches, rebuild async |
| GET | `/cache/warm/status` | `{inProgress, message, completedAt, success}` |
| GET | `/debug` | League info + game counts by season/stage |
| GET | `/debug/api` | Raw API response for a season/week |

---

## Frontend Pages

Routes: `/` Home, `/standings`, `/games`, `/elo`, `/qb`, `/trends`, `/about`, `/admin`. The `RZS Stats` wordmark links to `/`.

### HomePage
Landing page at `/`. One preview card per section (Standings, Games, Elo, QBs, Trends, About) in a 3-column grid; each card is a `Link` to its page. Every card fetches independently so one failed request doesn't blank the page — top 5 by PyPAT, latest week's scores, top 5 Elo with biggest riser, top 5 QBs by TANY/A, and a mini PyPAT line chart for the top 4 teams.

### StandingsPage
Main view. Sortable by any column (click header, click again to reverse). Default sort: PyPAT descending. Heat colors: green = good (PyPAT, Win%, Avg PF), red = bad (Avg PA, SoS), diverging blue/green = Luck. Sticky rank + team columns for mobile scroll. SoS toggle appears only for the active season. CSV + Excel export (hidden on mobile).

### GamesPage
Game cards for a selected season/stage/week. Prev/Next navigation. Each card links to the NeonSportz recap via `nsPk` (not `gameId`). SIM badge on simmed games.

### TrendsPage
Two tabs:
- **Season History**: Table of all seasons, W-L + PyPAT + Luck per team. Sortable by clicking any season's column header.
- **Week by Week**: Recharts line chart, cumulative PyPAT by week. Toggle teams on/off. Show All / Hide All buttons.

### AdminPage
Sync controls (incremental + force with confirmation modal), cache warming with live progress polling (2s interval while `inProgress=true`), sync status display. Footer shows nightly sync schedule.

### AboutPage
Three-column card grids for stat definitions (PyPAT, Luck, SoS) and page descriptions. Data sync banner. Resource links (videos, blog posts, external references).

---

## Caching

**Caffeine** — max 500 entries, 24h write-through TTL.

Cache names: `standings`, `games`, `weeks`, `seasons`, `seasonTrends`, `weeklyTrends`, `seasonGames`

All seven caches are evicted together on sync, force-sync, or cache warm. `seasonGames` is cached directly on `GameRepository.findRegularSeasonGames()` (Spring Data JPA repos support `@Cacheable`) so all callers share the same cache regardless of call site.

**After a deploy or Railway restart**, caches are cold. Hit `POST /api/admin/cache/warm` from the Admin page; poll `/api/admin/cache/warm/status` for progress. Target: <60s for a full warm.

---

## Data Sync

NeonSportzClient paginates via `next` links until null. SyncService:

1. Fetches league info → current `seasonIndex`
2. Upserts teams (key: `teamId`)
3. For each season 0…current:
   - Incremental mode: skips season if `count > 0` in DB
   - Upserts games: key = `(seasonIndex, gameId)`, sets `nsPk` for URLs
4. Evicts all caches

`nsPk` is the NeonSportz URL key (e.g. `11263917`). `gameId` is an external ref ID (e.g. `544735511`) used only for deduplication — never for URLs.

Scheduled: `0 0 4 * * *` America/New_York (4 AM ET, respects DST).

---

## N+1 Prevention

`GameEntity` has `@ManyToOne(EAGER)` on both team associations, but JPQL does **not** join eagerly — Hibernate fires separate SELECT per association. Every game-loading JPQL query must include:

```sql
LEFT JOIN FETCH g.homeTeam LEFT JOIN FETCH g.awayTeam
```

Omitting this causes 1 + 2N queries per load (289 queries for 144-game season → ~30s on Railway).

---

## Deployment (Railway)

**Backend**:
- `DATABASE_URL` must be JDBC format — construct manually:
  `jdbc:postgresql://${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}`
- Railway's default `DATABASE_URL` is a postgres:// URL — Spring rejects it
- `ALLOWED_ORIGINS`: set to the frontend Railway URL
- Auto-deploys on push to master

**Frontend**:
- Nginx listens on `${PORT}` (Railway injects this at runtime)
- `nginx/templates/default.conf.template` uses `envsubst` to replace `$PORT` and `$BACKEND_URL` at container startup
- Never hardcode port 80 in nginx config

---

## Indexing & Display Conventions

- **Season index**: 0-based. Frontend displays the league season number via `utils/seasons.js`: `index + 103` (e.g. index 0 → "Season 103")
- **Week index**: 0-based. Regular season: weeks 0–17
- **Stage index**: 0 = preseason, 1 = regular season + playoffs (playoffs = weekIndex 18+); stats queries cap regular season at week 17
- **Game status**: ≥2 = completed and counted; <2 = unplayed/future
- **Tied games**: Each team gets 0.5 wins toward record and expected wins
- **PyPAT rounding**: stored to 4 decimal places (`Math.round(val * 10000.0) / 10000.0`)
- **All values are nullable** for SoS fields — null means no data (no games played yet, no future opponents)

---

## Testing

Backend tests in `StatsServiceTest.java` — all unit tests using Mockito for repositories. Key patterns:
- `team(id, name)` helper creates `TeamEntity`
- `game(id, home, away, homeScore, awayScore)` creates completed game
- `futureGame(id, home, away)` creates unplayed game

Every bug fix should have a regression test that verifies the exact invariant that was broken (e.g., `sosTotalBetweenPlayedAndLeft` test for the SoS Total < min(Played, Left) bug).

Frontend tests in `frontend/src/test/` — Vitest + Testing Library. Run with `npm test -- --run`.
