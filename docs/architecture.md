# Architecture

## Project Structure

```
backend/src/main/java/com/rzs/stats/
├── controller/
│   ├── StatsController.java       # public API: /api/* (standings, games, trends, elo)
│   ├── PlayoffsController.java    # public API: /api/playoffs/picture, /odds, /clinch
│   ├── PlayoffsLeverageController.java # public API: /api/playoffs/leverage
│   ├── PlayoffsWhatIfController.java # public API: /api/playoffs/remaining, /simulate
│   ├── EloCalibrationController.java # public API: /api/playoffs/calibration
│   ├── QbController.java          # public API: /api/qb/*
│   ├── AdminController.java       # admin tools: /api/admin/*
│   └── AdminAuthController.java   # GET /api/admin/auth — token probe for the UI
├── service/
│   ├── StatsService.java          # PyPAT, SoS, standings, trends
│   ├── EloService.java            # Elo math and timeline with season/owner regression
│   ├── OwnerChangeService.java    # hardcoded Madden 27 ownership changes
│   ├── EloHistoryService.java     # replays every game to build rating history
│   ├── EloQueryService.java       # ratings / games / upcoming / matchup reads
│   ├── EloCalibrationService.java # pregame probability buckets and Brier scores
│   ├── EloConfigService.java      # persisted, tunable Elo knobs
│   ├── QbStatsService.java        # leaderboard + movement, ranking, qualification
│   ├── QbStatsCalculator.java     # TANY/A and RUSH+ formulas
│   ├── QbStatsSyncService.java    # per-week QB + team stat sync from NeonSportz
│   ├── QbStatsWeekWriter.java     # replaces one week of QB and team rows in one transaction
│   ├── TeamEfficiencyService.java # Pts/Drive, Pts/Play, Series % — offense and defense per team
│   ├── TeamEfficiencyCalculator.java # drives, plays and offensive-points formulas
│   ├── SyncService.java           # NeonSportz game/team sync
│   └── CacheWarmingService.java   # background cache population
├── playoffs/
│   ├── SeasonStateLoader.java     # reusable season schedule, identities, records input and week bounds
│   ├── PlayoffPictureService.java # Madden/NFL picture and alternate seeds
│   ├── SimulationService.java    # parallel Monte Carlo with paired, counter-based random draws
│   ├── LeverageService.java      # cached full conditional matrix and leverage projection
│   ├── OddsService.java          # cached Elo playoff odds
│   ├── WhatIfService.java        # validated game picks, fresh paired simulations and score-sensitive exact seeds
│   ├── OddsSnapshotService.java  # first Madden baseline per season/week/team
│   ├── ClinchService.java         # lazy cached proven markers
│   ├── ClinchAnalyzer.java        # record bounds and exhaustive W/L/T proofs
│   ├── TiebreakExplainer.java     # plain-English explanations from engine traces
│   ├── MaddenSeeding.java         # Madden 27 seeding engine
│   ├── PlayoffSeeding.java        # NFL seeding engine
│   └── TiebreakerRules.java       # NFL tiebreak steps
├── repository/
│   ├── GameRepository.java        # game queries (always JOIN FETCH teams)
│   ├── TeamRepository.java        # team lookups by teamId or nsId
│   ├── QbGameStatRepository.java  # QB rows by season/stage/week/roster
│   ├── TeamGameStatRepository.java # team box-score rows by season/stage/week
│   └── EloConfigRepository.java
├── model/
│   ├── entity/  GameEntity, TeamEntity, QbGameStatEntity, TeamGameStatEntity, EloConfigEntity
│   ├── dto/     StandingDto, GameDto, TeamDto, SeasonWeekDto,
│   │            EloDtos, EloConfig, QbStatDto, QbDtos, TeamEfficiencyDto
│   └── ns/      NsGame, NsTeam, NsLeague, NsPagedResponse,
│                NsPassingStat, NsRushingStat, NsTeamStat,
│                NsKickingStat, NsPuntingStat
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
│   ├── Tabs.jsx, SortTh.jsx, InfoTip.jsx, DivergingBar.jsx, ThemeToggle.jsx
├── utils/
│   ├── heat.js            # goodBadColor / magnitudeColor / divergeColor
│   ├── eloLean.js         # TIERS / lean() / tierShade / pct0 — shared by Elo + Home
│   ├── seasons.js         # seasonLabel — index + 103
│   ├── playoffRounds.js   # weekLabel
│   ├── chartColors.js, teamLogo.js, theme.js
└── pages/
    ├── HomePage.jsx       # landing page — live preview card per section
    ├── StandingsPage.jsx  # standings / season history / week by week tabs
    ├── EfficiencyPage.jsx # overview chart + offense / defense tables
    ├── GamesPage.jsx      # game results by week
    ├── EloPage.jsx        # ratings / history / matchup / games tabs
    ├── QbPage.jsx         # leaderboard + movement tabs
    ├── AdminPage.jsx      # sync controls, cache warming, Elo config
    └── AboutPage.jsx      # stat definitions, resources
```

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

### TeamGameStatEntity
One row per team per game, table `team_game_stats`. Unique constraint: `(seasonIndex, stageIndex, weekIndex, team_id)`; index on `(seasonIndex, stageIndex, weekIndex)`. Raw counts only — `passAtt`, `rushAtt`, `sacks`, `totalYds`, `firstDowns`, `thirdAtt/Conv`, `fourthAtt/Conv`, `redZones`, `redZoneTds`, `passTds`, `rushTds`, `intsLost`, `fumLost`, `punts`, `fgAtt/Made`, `xpAtt/Made`, `twoPtAtt/Conv`. Pass and rush attempts, kicks and punts are summed across every player on the team; the rest come from `/stats/teams/`. Plays, drives and points are derived at read time by `TeamEfficiencyCalculator`, so a formula change never needs a re-sync.

### EloConfigEntity
Single persisted row holding the tunable `EloConfig`. `EloConfigService.seed()` writes defaults when absent.

### OddsSnapshotEntity

Table `playoff_odds_snapshots`, created through Hibernate `ddl-auto=update` like the other entities (no migration framework). Unique `(season, next_week, team_id)` stores the first Madden baseline for a week: playoff, division and one-seed fractions, seven comma-separated seed fractions, simulation count, rules and UTC computed timestamp. `next_week=-1` represents a completed regular season. Warming inserts missing team rows and preserves existing snapshots, including across repeated syncs during the same week; NFL requests never write snapshots. A transaction inside the writer's lock serializes concurrent warmers in this application; the database constraint prevents duplicates across instances.

### StandingDto (key fields)
Record stats: `wins`, `losses`, `ties`, `gamesPlayed`, `winPct`, `pointsFor`, `pointsAgainst`
Advanced: `pythagoreanPat`, `winDiff` (Luck)
SoS: `oppPyPatCurr/Prev`, `oppPyPatRemainingCurr/Prev`, `oppPyPatTotalCurr/Prev`

## API Endpoints

### Public — `StatsController (/api)`
| Method | Path | Params | Returns |
|--------|------|--------|---------|
| GET | `/seasons` | — | `List<Integer>` — seasons with ≥10 games |
| GET | `/standings` | `season` | `List<StandingDto>` sorted by win% |
| GET | `/games` | `season`, `stage` (default 1), `week` | `List<GameDto>` |
| GET | `/games/weeks` | `season`, `stage` (default 1) | `List<Integer>` available weeks |
| GET | `/efficiency` | `season`, `stage` (`regular` default, `playoffs`, `both`) | `List<TeamEfficiencyDto>` sorted by net points per drive |
| GET | `/trends/season` | — | All seasons, all teams |
| GET | `/trends/weekly` | `season` | Week-by-week progression for one season |
| GET | `/elo/ratings` | `season`, `week` | `List<EloDtos.Rating>` — elo, rank, change, rankChange |
| GET | `/elo/history` | `season` (optional) | Rating per team per week; omit `season` for all |
| GET | `/elo/games` | `season`, `week`, `teamId` | Per-game Elo deltas and pregame ratings |
| GET | `/elo/upcoming` | `season`, `week` | Unplayed games with projected win probability |
| GET | `/elo/matchup` | `teamA`, `teamB`, `homeTeam` | Head-to-head win probability |

### Public — `PlayoffsController (/api/playoffs)`

| Method | Path | Params | Returns |
|--------|------|--------|---------|
| GET | `/odds` | `season` (optional), `rules` (`madden` default or `nfl`) | Elo Monte Carlo fractions, seven seed odds per team, simulation count and UTC computation timestamp |
| GET | `/picture` | `season` (optional, latest season with a completed regular-season game), `rules` (`madden` default or `nfl`) | Season index, week bounds, completed/remaining game counts, conference seeds and hunt, alternate seeds and tiebreak reasons |
| GET | `/clinch` | `season` (optional, current), `rules` (`madden` default or `nfl`) | Proven clinched/eliminated/null markers for playoffs, division and first seed; `exhaustive` indicates a completed search |

`ClinchAnalyzer` first proves markers from strict record bounds (2W+T), reserving missing schedule games up to 17. Madden requests may then enumerate every remaining W/L/T outcome across the entire league, pruning only with those same bounds. Searches split across the first two games, stop when every open goal has both outcomes, and discard all search-derived markers on timeout. Layer 2 requires exactly 17 scheduled games per team and at most `rzs.playoffs.clinch.max-remaining-games` (default 12); `rzs.playoffs.clinch.budget` defaults to `20s`. NFL requests use record math only. Unknown margins and arbitrary alphabetical fallbacks suppress search markers conservatively across their conference using engine `PointTie` metadata. Completed Madden seasons use their actual scores. No monotonicity or irrelevant-game pruning is used.

Uses completed stage 1 games in weeks 0–17. Invalid rules return 400; missing regular-season data or incomplete team conference/division metadata return 404. Shapes follow [the playoff API contract](playoffs-api.md). The loader includes teams from the selected regular-season schedule, including unplayed games.

The game-only NFL engine can leave ties unresolved when net touchdown totals or a coin toss are needed. Picture and simulations resolve these orders alphabetically; Picture reasons flag the arbitrary fallback.
The game-only NFL engine resolves unavailable net-touchdown or coin-toss decisions alphabetically for display, with an explicit reason explaining that the order is arbitrary.

### Public — `PlayoffsWhatIfController (/api/playoffs)`

| Method | Path | Params | Returns |
|--------|------|--------|---------|
| GET | `/remaining` | `season` (optional) | Remaining regular-season games sorted by week and game ID, with the simulator's unrounded Elo home-win probabilities |
| POST | `/simulate` | JSON `season`, `rules`, `picks`, `simulations` | Fresh forced odds, baseline odds for the same season/rules, seven seed fractions per team, and exact seed rows when every remaining game is picked |

`WhatIfService` validates all picks before starting simulations or loading baseline odds. Picks must be distinct remaining regular-season games of the selected season, with results `home`, `away`, or `tie`. Rules default to `madden`; simulations default to 5,000 and must be 1–20,000. Pick counts above the remaining schedule size return 400 before per-pick processing. Neither endpoint adds a cache.

Forced runs use `SimulationService` with the baseline's season/week/rules seed, preserving every unpicked game's outcome and margin. What-If opts into varying forced margins across simulations. Exact mode additionally seeds once with synthetic scores (24–17 home, 17–24 away, 20–20 tie). It uses the Picture row type and `TiebreakExplainer` for final seeds, alternate-rule seeds and reasons. Trace groups decided by points, an alphabetical fallback or a coin toss flag every member with `dependsOnScores` when any member is a playoff seed or division winner. Margin-varied fractional playoff, division or one-seed counts also flag teams affected by cascading ties. If the initial trace flags no team, the forced simulation is skipped. Flagged teams retain simulated margin odds; other teams receive deterministic 0/1 odds and seed fractions. Baselines first use `OddsService.available`, including the default-season cache key, and otherwise compute from the same loaded state and probabilities as the forced run. Omitted simulation counts use the baseline configuration (normally 20,000); empty picks return baseline odds unchanged. What-If results use a bounded 128-entry Caffeine cache keyed by season, rules, sorted picks and count, registered in `allStatsCaches` for sync eviction. Two calculation permits limit concurrency; a 250 ms wait expires with plain-text 503. Request-specific Jackson deserialization rejects unknown fields and fractional integers and bounds picks at 272 before iterating. Null-status games are excluded from the loaded playoff schedule, matching the Elo upcoming query.

### Public — `EloCalibrationController (/api/playoffs)`

| Method | Path | Params | Returns |
|--------|------|--------|---------|
| GET | `/calibration` | `season` (optional, all seasons by default) | `games`, `brier`, `coinFlipBrier`, and nonempty probability `buckets` |

`EloCalibrationService` reads unrounded pregame home win probabilities from the shared Elo history, selecting completed stage 1 games in weeks 0–17. Buckets are 0.1 wide, include their lower bound, and exclude their upper bound except for 1.0 in the final bucket. Each bucket returns `low`, `high`, `games`, mean `predicted` probability, and `actual` home win rate. Ties count as 0.5 for both win rate and Brier scores. `brier` is mean squared prediction error; `coinFlipBrier` always predicts 0.5 over the same games. Empty selections return zero games, zero scores, and an empty bucket list. Shapes follow [the playoff API contract](playoffs-api.md#get-apiplayoffscalibration).

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
| POST | `/sync/qb` | Sync QB and team game stats from NeonSportz |
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
- The frontend keeps the token in `localStorage` under `rzs-admin-token` and attaches it to `/admin` calls only ([api/client.js](../frontend/src/api/client.js)). AdminPage calls `/api/admin/auth` to decide whether to show the passcode gate.

### Playoff simulation

`SimulationService.simulate(state, probabilities, forced, simulations, seed, rules)` seeds the full league independently for each parallel simulation and reduces integer counts. `Outcome` supports HOME, AWAY and forced TIE. Its `games` primitive exposes each simulated schedule for paired leverage; `outcomeGame` shares outcome-to-score conversion with future clinch integration. SplitMix64 counters depend only on base seed, simulation index and game ID, so forcing a game leaves every other game's outcome and margin unchanged. Unforced draws never tie. Losers score 20; margins 1, 3, 7, 10, 14 and 21 are equally likely; forced ties score 20-20. By default forced margins depend on seed and game ID alone, so fully forced schedules give exact 0/1 odds. The optional `varyForcedMargins` overload instead uses each simulation's existing margin counter, allowing What-If to model score-sensitive ties while preserving paired draws for unpicked games.

`OddsService` uses the selected season's latest Elo timeline ratings and the same `EloService.probability` plus home field as upcoming games. Teams without a timeline rating start at the configured initial rating. `playoffs.simulations` defaults to 20,000; the baseline seed is stable for season, next week and rules. Completed seasons use exact seeding with zero simulations. Unresolved NFL orders use the same alphabetical fallback as Picture, as documented in the API contract.

`LeverageService.matrix(season, week, rules)` returns an immutable `LeverageMatrix` with conditional odds for every team in every remaining game of the selected week (default next week). Each game runs HOME and AWAY with the same base seed and `playoffs.leverage-simulations` (default 10,000). `/api/playoffs/leverage` projects participants, importance summed over the full league, and up to five other teams ranked by their largest absolute goal swing. Empty weeks return an empty list, including completed seasons. Participant `current` is the exact Elo-weighted mixture of the two conditional runs; it can differ from `/odds` due to simulation noise.

Picture rows join the available cached season/rules baseline from `OddsService` without starting simulations; missing or failed odds are omitted without failing the Picture response. Elo configuration updates evict Picture and leverage alongside odds.
`OddsService` uses the selected season's latest Elo timeline ratings and the same `EloService.probability` plus home field as upcoming games. Teams without a timeline rating start at the configured initial rating. `playoffs.simulations` defaults to 20,000; the baseline seed is stable for season, next week and rules. Completed seasons use exact seeding with zero simulations. NFL ties requiring unavailable data use the same alphabetical display fallback as Picture.

## Caching

**Caffeine** — max 500 entries, 24h write-through TTL.

Cache names: `standings`, `games`, `weeks`, `seasons`, `seasonTrends`, `weeklyTrends`, `seasonGames`, `eloHistory`, `qbStats`, `teamEfficiency`, `playoffPicture`, `playoffOdds`, `leverage`, `eloCalibration`, `playoffClinch`, `playoffPath`

The list lives in one place — [config/CacheNames.java](../backend/src/main/java/com/rzs/stats/config/CacheNames.java), as the `allStatsCaches` resolver. **A new cache must be added there**, or it silently survives eviction and serves stale data after a sync. All registered caches are evicted together on sync, force-sync, or cache warm. `seasonGames` is cached directly on `GameRepository.findRegularSeasonGames()` (Spring Data JPA repos support `@Cacheable`) so all callers share the same cache regardless of call site.

The list lives in one place — [config/CacheNames.java](../backend/src/main/java/com/rzs/stats/config/CacheNames.java), as the `allStatsCaches` resolver. **A new cache must be added there**, or it silently survives eviction and serves stale data after a sync. All listed caches are evicted together on sync, force-sync, or cache warm. `seasonGames` is cached directly on `GameRepository.findRegularSeasonGames()` (Spring Data JPA repos support `@Cacheable`) so all callers share the same cache regardless of call site.

`playoffClinch` computes lazily on the first request after shared sync/force-sync/cache-warm eviction, and caches by season parameter and rules. Its work runs only on clinch requests and its own bounded search workers, so no other endpoint waits for it.

`playoffPicture` caches the complete response by season parameter and rules, including the default-season request, once odds are present. Responses without a baseline are not cached so a later warmed baseline appears immediately. It participates in the same sync, force-sync, and cache-warm eviction resolver.

`playoffOdds` caches the full response by requested season and rules; Elo configuration updates evict it with the Elo timeline. Cache warming computes the current default season's Madden baseline after Elo, then saves its snapshot. Successful manual, force, verbose and nightly syncs trigger warming on their background execution path; startup does not run simulations. Snapshot persistence is separate from cached reads, so a warmed cached response is still saved once. An odds or snapshot failure is logged without failing the other warmed caches, following the QB warming pattern.

`leverage` caches the full matrix by requested season, week and rules and participates in shared eviction. After sync, warming requests the current season and next week through the default parameters, independently of odds/snapshot failures. Startup does not warm simulations.

`eloCalibration` caches reports separately for each requested season and for all seasons. It participates in shared eviction and is also evicted alongside `eloHistory` when Elo configuration changes.

## Data Sync

NeonSportzClient paginates via `next` links until null. SyncService:

1. Fetches league info → current `seasonIndex`
2. Upserts teams (key: `teamId`)
3. For each season 0…current:
   - Incremental mode: skips season if `count > 0` in DB
   - Upserts games: key = `(seasonIndex, gameId)`, sets `nsPk` for URLs
4. Evicts all caches

`nsPk` is the NeonSportz URL key (e.g. `11263917`). `gameId` is an external ref ID (e.g. `544735511`) used only for deduplication — never for URLs.

### QB and team stat sync is separate
`QbStatsSyncService` runs on its own trigger (`POST /api/admin/sync/qb`) and walks season/stage/week, with `QbStatsWeekWriter` replacing one week of QB rows and team rows together in one transaction. Each week reads five paginated feeds (passing, rushing, teams, kicking, punting) at 100 rows a page, so a week is at least five requests and more when a feed spans pages (rushing usually does); a 429 is waited out and retried up to six times. The incremental run skips a week only when both QB and team rows exist, so the first run after deploying team stats backfills history by itself. A fresh database that has games synced can still have **zero QB rows** — the QB leaderboard and the Efficiency page will come back empty until this sync runs. Worth remembering when a local environment looks half-empty.

## N+1 Prevention

`GameEntity` has `@ManyToOne(EAGER)` on both team associations, but JPQL does **not** join eagerly — Hibernate fires separate SELECT per association. Every game-loading JPQL query must include:

```sql
LEFT JOIN FETCH g.homeTeam LEFT JOIN FETCH g.awayTeam
```

Omitting this causes 1 + 2N queries per load (289 queries for 144-game season → ~30s on Railway).

### Path to the Playoffs

`GET /api/playoffs/path/{abbr}` accepts optional `season` and `rules` (Madden by default). `PathService` combines cached baseline odds and proven clinch markers with fresh win-out simulations. Unknown teams or seasons return 404; invalid rules return 400. `simulations` is the baseline sample count. `playoffs.path-simulations` defaults to 5,000 for win-out runs; all draws use the baseline season/week/rules seed, with varying forced margins.

`SimulationService` optionally tracks one team's final win totals and goal counts in the same simulation pass; ordinary runs allocate no win buckets. Path repeats the baseline's sample count and seed with this tracking enabled. Final-record rows below 0.5% probability are omitted. The ceiling takes the best nonzero seed across baseline and win-out distributions, subject to proven markers, and retains the baseline seed distribution.

Constrained `ClinchAnalyzer` accepts a matchup-to-outcome map. Fixed results contribute to both record bounds and restrict search branches, while their unknown margins remain part of the conservative ambiguity analysis. `controlsDestiny` requires a proven playoff clinch under win-out constraints; search caps, incomplete schedules, timeouts and NFL rules retain the constrained record-math fallback.

Weekly rooting uses the cached full `LeverageMatrix`. Win-out risks pair home/away runs with identical draws under all team-win constraints (`playoffs.path-risk-simulations`, default 2,000 per side). Candidates include games with at least one other team in the selected team's conference, including cross-conference games, and exclude the selected team's games. Only the nearest 40 candidates by week then game ID are evaluated. Both lists keep the five largest absolute playoff swings of at least 0.02; swing is home-win minus away-win odds.

`playoffPath` caches lazily by `(season parameter, abbreviation, rules)`, participates in `allStatsCaches` eviction and Elo configuration eviction, and is never warmed. One Path computation at a time is admitted per application instance; excess uncached team requests receive 503. Cached responses remain available while another analysis runs.
