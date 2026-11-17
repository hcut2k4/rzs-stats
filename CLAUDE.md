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

---

## Project Structure

```
backend/src/main/java/com/rzs/stats/
├── controller/
│   ├── StatsController.java       # public API: /api/* (standings, games, trends, elo)
│   ├── QbController.java          # public API: /api/qb/*
│   ├── AdminController.java       # admin tools: /api/admin/*
│   └── AdminAuthController.java   # GET /api/admin/auth — token probe for the UI
├── service/
│   ├── StatsService.java          # PyPAT, SoS, standings, trends
│   ├── EloService.java            # pure Elo math (probability, MOV, regression)
│   ├── EloHistoryService.java     # replays every game to build rating history
│   ├── EloQueryService.java       # ratings / games / upcoming / matchup reads
│   ├── EloConfigService.java      # persisted, tunable Elo knobs
│   ├── QbStatsService.java        # leaderboard + movement, ranking, qualification
│   ├── QbStatsCalculator.java     # TANY/A and RUSH+ formulas
│   ├── QbStatsSyncService.java    # per-week QB stat sync from NeonSportz
│   ├── QbStatsWeekWriter.java     # upserts one week of QB rows
│   ├── SyncService.java           # NeonSportz game/team sync
│   └── CacheWarmingService.java   # background cache population
├── repository/
│   ├── GameRepository.java        # game queries (always JOIN FETCH teams)
│   ├── TeamRepository.java        # team lookups by teamId or nsId
│   ├── QbGameStatRepository.java  # QB rows by season/stage/week/roster
│   └── EloConfigRepository.java
├── model/
│   ├── entity/  GameEntity, TeamEntity, QbGameStatEntity, EloConfigEntity
│   ├── dto/     StandingDto, GameDto, TeamDto, SeasonWeekDto,
│   │            EloDtos, EloConfig, QbStatDto, QbDtos
│   └── ns/      NsGame, NsTeam, NsLeague, NsPagedResponse,
│                NsPassingStat, NsRushingStat, NsTeamStat
├── client/  NeonSportzClient.java
├── scheduler/  SyncScheduler.java   # nightly @Scheduled cron
└── config/
    ├── WebConfig.java              # CORS
    ├── CacheNames.java             # the ALL cache resolver — every cache name lives here
    └── AdminTokenFilter.java       # X-Admin-Token gate on /api/admin/**

frontend/src/
├── App.jsx                # routes + nav; wordmark links to /
├── api/client.js          # all axios calls + admin token handling
├── components/
│   ├── PageHeader.jsx     # title + qualifier + takeaway + rule — every page uses it
│   ├── TeamLogo.jsx       # TeamLogo + TeamCell (ESPN CDN logos)
│   ├── LeanBar.jsx        # center-out diverging bar for projected games
│   ├── SeasonHistoryTab.jsx, WeeklyTab.jsx   # Standings' history + week-by-week tabs
│   ├── Tabs.jsx, InfoTip.jsx, DivergingBar.jsx, ThemeToggle.jsx
├── utils/
│   ├── heat.js            # goodBadColor / magnitudeColor / divergeColor
│   ├── eloLean.js         # TIERS / lean() / tierShade / pct0 — shared by Elo + Home
│   ├── seasons.js         # seasonLabel — index + 103
│   ├── playoffRounds.js   # weekLabel
│   ├── chartColors.js, teamLogo.js, theme.js
└── pages/
    ├── HomePage.jsx       # landing page — live preview card per section
    ├── StandingsPage.jsx  # standings / season history / week by week tabs
    ├── GamesPage.jsx      # game results by week
    ├── EloPage.jsx        # ratings / history / matchup / games tabs
    ├── QbPage.jsx         # leaderboard + movement tabs
    ├── AdminPage.jsx      # sync controls, cache warming, Elo config
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
Average PyPAT of opponents, with three key refinements:

1. **Game-weighted, not opponent-weighted**: The average runs over one entry *per game on the schedule*, so a division rival played twice contributes twice. Averaging distinct opponents instead under-weights division rivals (14 unique opponents across a 17-game schedule) and was worth up to 5 points of SoS and 12 places of ranking.

2. **H2H exclusion**: Each opponent's PyPAT is recalculated *removing games vs. the subject team*. Prevents circular bias — without this, strong teams would artificially lower their own SoS.

3. **Three columns**:
   - **SoS Played**: Opponents faced so far
   - **SoS Left**: Remaining opponents (from unplayed games)
   - **SoS Total**: Game-count-weighted average: `(SoS_Played × gamesPlayed + SoS_Left × gamesLeft) / totalGames`
     - Because both sides average one value per game, this is exactly the mean over the full schedule
     - **NOT a union average** — that approach lets weak played-only opponents drag Total below both Played and Left

4. **Toggle (active season only, 3+ games played)**: Current-season vs prior-season opponent PyPAT. Prior season is the default — early in a season, current-season sample sizes are too small to be meaningful. The toggle is hidden until some team has played 3 games, because before that an opponent's only games are the ones against you and nothing survives the H2H exclusion.

5. **Unratable opponents are null, never 0.0**: If an opponent has no games left after H2H exclusion, they contribute nothing. If *no* opponent on a column could be rated, the column is `null` — "no data", which is not the same as a 0.0 rating. Each column is weighted by the games it actually rated, so Total stays the mean over every rated game.

---

### Elo
Rolling team strength that carries across seasons. Config is persisted and tunable at `PUT /api/admin/elo/config` (`EloConfig` record, validated on write):

| Knob | Default meaning |
|------|-----------------|
| `initialRating` | Every team's starting rating (1500) |
| `k` | Step size per game; validated to 1–100 |
| `divisor` | Logistic scale for win probability |
| `movEnabled` / `marginCap` | Margin-of-victory multiplier, capped at `marginCap` points (21) |
| `homeFieldAdvantage` | Rating points added to the home side for the prediction |
| `offseasonRetention` | Fraction of distance from `initialRating` kept between seasons (0.9) |

`EloHistoryService` **replays every game in order** to build history — ratings are derived, never stored per game. Playoffs count. Changing config changes all history, so the `eloHistory` cache is evicted with the rest.

### TANY/A and RUSH+ (QB stats)
Total Adjusted Net Yards per Attempt — one number for passing *and* rushing:

```
TANY/A = (passYds − sackYds + rushYds + 20×(passTD + rushTD) − 45×(INT + fumblesLost))
         ÷ (passAtt + sacks + rushAtt)
```

Rushing counts in both numerator and denominator, so volume alone can't inflate it. RUSH+ isolates the rushing contribution: yards above 4 per carry, +20 per rush TD, −45 per estimated lost fumble. **Every estimated fumble is charged to RUSH+**, so it is read alongside TANY/A, not added to it.

Sack yardage and lost fumbles are not in the per-player feed — they're estimated from team game stats (`teamSacks`, `teamFumblesLost` on `QbGameStatEntity`).

**Qualification** gates the leaderboard. Default minimum attempts by scope: WEEK → 10, SEASON → `10 × team games played`, ALLTIME → 250 (`ALLTIME_MIN_ATT`), or 50 for playoffs (`ALLTIME_PLAYOFF_MIN_ATT`). Unqualified QBs are filtered out unless `includeUnqualified=true`, get no `rank`, and are excluded from heat-map ranges. `minAtt` overrides the default.

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

### QbGameStatEntity
One row per quarterback per game. Unique constraint: `(seasonIndex, stageIndex, weekIndex, rosterId)` — that tuple is the upsert key. Indexes on `(seasonIndex, stageIndex, weekIndex)` and `rosterId`.

Per-player fields: `passAtt`, `passComp`, `passYds`, `passTd`, `passInt`, `passSacks`, `rushAtt`, `rushYds`, `rushTd`, `rushFum`, `passerRating`, `playerName`, `rosterId` (String — also the NeonSportz player-page key), `team`.

Team-level fields used to *estimate* what the player feed omits: `teamPasserYards`, `teamNetPassYds`, `teamSacks`, `teamFumbles`, `teamFumblesLost`.

### EloConfigEntity
Single persisted row holding the tunable `EloConfig`. `EloConfigService.seed()` writes defaults when absent.

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
| GET | `/elo/ratings` | `season`, `week` | `List<EloDtos.Rating>` — elo, rank, change, rankChange |
| GET | `/elo/history` | `season` (optional) | Rating per team per week; omit `season` for all |
| GET | `/elo/games` | `season`, `week`, `teamId` | Per-game Elo deltas and pregame ratings |
| GET | `/elo/upcoming` | `season`, `week` | Unplayed games with projected win probability |
| GET | `/elo/matchup` | `teamA`, `teamB`, `homeTeam` | Head-to-head win probability |

### Public — `QbController (/api/qb)`
| Method | Path | Params | Returns |
|--------|------|--------|---------|
| GET | `/leaderboard` | `scope`, `season`, `week`, `stage`, `minAtt`, `includeUnqualified` | `List<QbStatDto>` ranked by TANY/A |
| GET | `/movement` | `season`, `stage`, `window`, `basis` | `QbDtos.Movement` — risers and fallers |

**⚠️ Two different stage conventions.** The QB endpoints parse `stage` as a **named enum** — `regular`, `playoffs` or `both` (`Stage`, default `REGULAR`). The games endpoints take a **numeric** `stageIndex` (`0`, `1`). Passing `stage=1` to a QB endpoint is a 400. `scope` is `week` | `season` | `alltime`; `basis` is `season` | `alltime`.

### Admin — `AdminController (/api/admin)`
| Method | Path | Notes |
|--------|------|-------|
| POST | `/sync` | Incremental sync — skips historical seasons |
| POST | `/sync/force` | Re-syncs all seasons (~30 min, heavy API load) |
| POST | `/sync/verbose` | Sync with detailed per-game log (synchronous) |
| GET | `/sync/status` | `{lastSyncTime, lastSyncMessage, lastSyncSuccess}` |
| POST | `/cache/warm` | Evict all caches, rebuild async |
| GET | `/cache/warm/status` | `{inProgress, message, completedAt, success}` |
| POST | `/sync/qb` | Sync QB game stats from NeonSportz |
| GET | `/sync/qb/status` | QB sync progress + last result |
| GET | `/elo/config` | Current `EloConfig` |
| PUT | `/elo/config` | Update Elo knobs — validated, rejects out-of-range values |
| GET | `/auth` | Token probe — 200 if the supplied token is valid (or none is required) |
| GET | `/debug` | League info + game counts by season/stage |
| GET | `/debug/api` | Raw API response for a season/week |

### Admin authentication
`AdminTokenFilter` gates `/api/admin/**` on the `X-Admin-Token` header, compared with `MessageDigest.isEqual` (constant-time).

- Token comes from `rzs.admin-token` / the `ADMIN_TOKEN` env var.
- **Unset = the filter is disabled and admin routes are wide open.** That's the local-dev default; always set `ADMIN_TOKEN` in any deployed environment.
- `OPTIONS` is exempt so CORS preflight still works.
- The frontend keeps the token in `localStorage` under `rzs-admin-token` and attaches it to `/admin` calls only ([api/client.js](frontend/src/api/client.js)). AdminPage calls `/api/admin/auth` to decide whether to show the passcode gate.

---

## Frontend Pages

Routes: `/` Home, `/standings`, `/games`, `/elo`, `/qb`, `/about`, `/admin`. The `RZS Stats` wordmark links to `/`. `/trends` no longer has a page — it redirects to `/standings?tab=history`, so old links and bookmarks keep working.

### HomePage
Landing page at `/`. Leads with **Best Games Ahead** — the five closest unplayed games league-wide, ranked by the favorite's win probability (closest to a coin flip first, week ascending as tiebreak), linking to `/elo?tab=games`. Below it, one preview card per section (Standings, Games, Elo, QBs, Trends, About) in a 3-column grid; each card is a `Link` to its page. The Trends card has no page of its own — it links to `/standings?tab=weekly`. Every section fetches independently so one failed request doesn't blank the page — top 5 by PyPAT, latest week's scores, top 5 Elo with biggest riser, top 5 QBs by TANY/A, and a mini PyPAT line chart for the top 4 teams.

The Best Games table mirrors the Elo **Projected** table — same columns, `LeanBar`, Outlook tiers and shading — by importing the same helpers rather than restating them. **The tier thresholds, colors and `lean()` live only in [utils/eloLean.js](frontend/src/utils/eloLean.js)**; change them there and both tables move together.

### StandingsPage
Three tabs, with the active one held in the URL as `?tab=standings|history|weekly` (`standings` omits the param) — same contract as EloPage: deep links work, an unknown value falls back to Standings, and tab switches use `replace`. The season picker lives in the header and is shared by Standings and Week by Week; it is hidden on Season History, which spans every season. The header qualifier is per-tab. Group-by-conference and the SoS toggle are Standings-tab controls and render below the tab row, not in the header.
- **Standings**: Sortable by any column (click header, click again to reverse). Default sort: PyPAT descending. Heat colors: green = good (PyPAT, Win%, Avg PF), red = bad (Avg PA, SoS), diverging blue/green = Luck. Sticky rank + team columns for mobile scroll. SoS toggle appears only for the active season. CSV + Excel export (hidden on mobile).
- **Season History**: Table of all seasons, W-L + PyPAT + Luck per team. Sortable by clicking any season's column header. `/trends/season` returns every season × every team, so it is fetched only when this tab is first opened, then held in page state — never on a plain Standings visit. A failed fetch shows an error with a Retry button rather than an empty table. The tab mounts only once the data is in, so its default sort (latest season, W-L) initializes against real data.
- **Week by Week**: Recharts line chart, cumulative PyPAT by week. Click teams to highlight them; the rest fade back. A response for a season the user has already switched away from is ignored, and a failed load shows an error instead of the previous season's chart.

### GamesPage
Game cards for a selected season/stage/week. Prev/Next navigation. Each card links to the NeonSportz recap via `nsPk` (not `gameId`). SIM badge on simmed games.

### EloPage
Four tabs, with the active one held in the URL as `?tab=ratings|history|matchup|games` (`ratings` omits the param). Deep links work — the home page points at `/elo?tab=games` — and an unknown value falls back to Ratings. Tab switches use `replace`, so Back doesn't walk through every tab visited.
- **Ratings**: All 32 teams by Elo, with weekly change, rank movement, a diverging bar vs 1500, and top-5 risers/droppers.
- **History**: Rating lines across every season. Click teams to highlight. Dotted verticals mark season starts (where ratings regress toward 1500).
- **Matchup**: Pick two teams for a win probability split bar.
- **Games**: Per-game Elo deltas, pregame ratings, MOV multiplier; projected probabilities for unplayed games.

Every column header carries a plain-language tooltip (`TIPS` map at the top of the file) — keep that pattern when adding columns. The Projected and played tables are both sortable via the local `useSorter` hook; Projected defaults to closest-first.

**Outlook tiers** rate how competitive an unplayed game should be, off the favorite's win chance: Toss-up <55%, Tilt <60%, Lean <70%, Likely <85%, Solid above. Each tier has its own color, deep at the competitive end of its band and fading to nearly white at the far end. `upsetInfo` reuses the same bands to size upsets on completed games, and deliberately returns nothing for a Toss-up — neither side was favored enough for the result to surprise.

### QbPage
Two tabs:
- **Leaderboard**: Every QB by TANY/A. Column *presets* (efficiency / classic / rushing / all) control which of `ALL_COLS` render. Regular / Playoffs / Both toggle, `minAtt` input, "show unqualified" checkbox. Unqualified rows render at 50% opacity with no rank. CSV + Excel export.
- **Movement**: Biggest risers and fallers over a configurable window, plus a rank-by-week chart (season or all-time basis).

QB names link to the player's NeonSportz page via `rosterId`.

### AdminPage
Passcode gate driven by `GET /api/admin/auth`. Sync controls (incremental + force with confirmation modal, QB sync), cache warming with live progress polling (2s interval while `inProgress=true`), Elo config editor, sync status display. Footer shows nightly sync schedule.

### AboutPage
Card grids for stat definitions (PyPAT, Luck, SoS, Elo, TANY/A, RUSH+) and per-page descriptions. Data sync banner. Resource links (videos, blog posts, external references). **Adding a stat or a page means adding it here too** — this page is the user-facing contract for what every number means.

---

## Caching

**Caffeine** — max 500 entries, 24h write-through TTL.

Cache names: `standings`, `games`, `weeks`, `seasons`, `seasonTrends`, `weeklyTrends`, `seasonGames`, `eloHistory`, `qbStats`

The list lives in one place — [config/CacheNames.java](backend/src/main/java/com/rzs/stats/config/CacheNames.java), as the `allStatsCaches` resolver. **A new cache must be added there**, or it silently survives eviction and serves stale data after a sync. All nine are evicted together on sync, force-sync, or cache warm. `seasonGames` is cached directly on `GameRepository.findRegularSeasonGames()` (Spring Data JPA repos support `@Cacheable`) so all callers share the same cache regardless of call site.

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

Scheduled: `0 0 4 * * *` America/New_York (4 AM ET, respects DST), overridable via `SYNC_CRON`.

### QB stat sync is separate
`QbStatsSyncService` runs on its own trigger (`POST /api/admin/sync/qb`) and walks season/stage/week, with `QbStatsWeekWriter` upserting one week at a time. A fresh database that has games synced can still have **zero QB rows** — the QB leaderboard will come back `[]` until the QB sync runs. Worth remembering when a local environment looks half-empty.

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
- `ADMIN_TOKEN`: **must be set**, or every `/api/admin/**` route is unauthenticated
- `SYNC_CRON`: optional override of the nightly schedule
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
- **All values are nullable** for SoS fields, including SoS Played — null means no data (no games played yet, no future opponents, or no opponent ratable after H2H exclusion)

---

## Testing

Backend tests in `backend/src/test/java/com/rzs/stats/`, run with `./mvnw test`:

| Area | Tests |
|------|-------|
| Stats | `StatsServiceTest`, `StatsControllerTest`, `StatsCacheTest` |
| Elo | `EloServiceTest`, `EloHistoryServiceTest`, `EloControllerTest`, `EloPersistenceTest` |
| QB | `QbStatsCalculatorTest`, `QbStatsServiceTest`, `QbStatsSyncServiceTest`, `QbControllerTest`, `QbStatsPersistenceTest` |
| Sync & admin | `SyncServiceTest`, `SyncSchedulerTest`, `AdminControllerTest`, `CacheWarmingServiceTest` |
| Auth | `AdminTokenTest`, `AdminTokenUnsetTest` — both the gated and the open case |
| Repository | `GameRepositoryTest` |

Service tests use Mockito for repositories. Key `StatsServiceTest` helpers:
- `team(id, name)` creates `TeamEntity`
- `game(id, home, away, homeScore, awayScore)` creates a completed game
- `futureGame(id, home, away)` creates an unplayed game

Persistence tests (`*PersistenceTest`) use a real DB rather than mocks — that's where unique constraints and upsert behavior get verified.

Every bug fix should have a regression test that verifies the exact invariant that was broken (e.g., `sosTotalBetweenPlayedAndLeft` for the SoS Total < min(Played, Left) bug).

Frontend tests in `frontend/src/test/` — Vitest + Testing Library. Run with `npm test -- --run`. Tests that render a page must wrap it in a `MemoryRouter`; pages are mocked at the `api/client` boundary with `vi.mock('../api/client')`.
