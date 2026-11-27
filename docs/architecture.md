# Architecture

## Project Structure

```
backend/src/main/java/com/rzs/stats/
├── controller/
│   ├── StatsController.java       # public API: /api/* (standings, games, trends, elo)
│   ├── PlayoffsController.java    # public API: /api/playoffs/picture, /odds, /clinch
│   ├── PlayoffsChampionshipController.java # public API: /api/playoffs/championship
│   ├── PlayoffsOddsHistoryController.java # public history and admin odds backfill
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
│   ├── SimulationService.java    # bounded Monte Carlo with paired, counter-based random draws
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
├── scheduler/  SyncScheduler.java   # one-minute ticker + nightly FULL
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
| GET | `/championship` | `season` (optional), `rules` | Baseline simulations extended through the seven-seed bracket; advancement and title fractions |
| GET | `/odds/history` | `season` (optional), `team` (optional abbreviation) | Saved Madden weekly snapshots, oldest first; empty snapshots return 200 |
| GET | `/odds` | `season` (optional), `rules` (`madden` default or `nfl`) | Elo Monte Carlo fractions, seven seed odds per team, simulation count and UTC computation timestamp |
| GET | `/picture` | `season` (optional, latest season with a completed regular-season game), `rules` (`madden` default or `nfl`) | Season index, week bounds, completed/remaining game counts, conference seeds and hunt, alternate seeds and tiebreak reasons |
| GET | `/clinch` | `season` (optional, current), `rules` (`madden` default or `nfl`) | Proven clinched/eliminated/null markers for playoffs, division and first seed; `exhaustive` indicates a completed search |

`ClinchAnalyzer` first proves markers from strict record bounds (2W+T), reserving missing schedule games up to 17. Madden requests may then enumerate every remaining W/L/T outcome across the entire league, pruning only with those same bounds. Searches run on the shared bounded executor, stop when every open goal has both outcomes, and discard all search-derived markers on timeout. Layer 2 requires exactly 17 scheduled games per team and at most `rzs.playoffs.clinch.max-remaining-games` (default 12); `rzs.playoffs.clinch.budget` defaults to `20s`. NFL requests use record math only. Unknown margins and arbitrary alphabetical fallbacks suppress search markers conservatively across their conference using engine `PointTie` metadata. Completed Madden seasons use their actual scores. No monotonicity or irrelevant-game pruning is used.

Uses completed stage 1 games in weeks 0–17. Invalid rules return 400; missing regular-season data or incomplete team conference/division metadata return 404. Shapes follow [the playoff API contract](playoffs-api.md). The loader includes teams from the selected regular-season schedule, including unplayed games.

The game-only NFL engine can leave ties unresolved when net touchdown totals or a coin toss are needed. Picture and simulations resolve these orders alphabetically; Picture reasons flag the arbitrary fallback.
The game-only NFL engine resolves unavailable net-touchdown or coin-toss decisions alphabetically for display, with an explicit reason explaining that the order is arbitrary.

### Public — `PlayoffsWhatIfController (/api/playoffs)`

| Method | Path | Params | Returns |
|--------|------|--------|---------|
| GET | `/remaining` | `season` (optional) | Remaining regular-season games sorted by week and game ID, with the simulator's unrounded Elo home-win probabilities |
| POST | `/simulate` | JSON `season`, `rules`, `picks`, `simulations` | Fresh forced odds, baseline odds for the same season/rules, seven seed fractions per team, and exact seed rows when every remaining game is picked |

`WhatIfService` validates all picks before starting simulations or loading baseline odds. Picks must be distinct remaining regular-season games of the selected season, with results `home`, `away`, or `tie`. Rules default to `madden`; simulations default to the 20,000 baseline count and must be 1–20,000. Pick counts above the remaining schedule size return 400 before per-pick processing. Remaining schedules are uncached; simulation results use the shared bounded What-If cache.

Forced runs use `SimulationService` with the baseline's season/week/rules seed, preserving every unpicked game's outcome and margin. What-If opts into varying forced margins across simulations. Exact mode additionally seeds once with synthetic scores (24–17 home, 17–24 away, 20–20 tie). It uses the Picture row type and `TiebreakExplainer` for final seeds, alternate-rule seeds and reasons. Trace groups decided by points, an alphabetical fallback or a coin toss flag every member with `dependsOnScores` when any member is a playoff seed or division winner. Margin-varied fractional playoff, division or one-seed counts also flag teams affected by cascading ties. If the initial trace flags no team, the forced simulation is skipped. Flagged teams retain simulated margin odds; other teams receive deterministic 0/1 odds and seed fractions. Baselines first use `OddsService.available`, using the canonical season cache key, and otherwise compute from the same loaded state and probabilities as the forced run. Omitted simulation counts use the baseline configuration (normally 20,000); empty picks return baseline odds unchanged. What-If results use a bounded 128-entry Caffeine cache keyed by season, rules, sorted picks and count, registered in `allStatsCaches` and invalidated when simulation inputs change. A shared `ComputeGate` limits cold What-If, Path, leverage, championship and baseline odds computations (`playoffs.max-concurrent-computations`, default 2); `playoffs.compute-timeout-ms` defaults to 10,000 and expires with plain-text 503. Cache hits bypass the gate, exceptions release permits, and warming waits without a timeout. Path loads its separately gated baseline and leverage before acquiring its own permit to avoid waiting on cache locks while holding capacity. Request-specific Jackson deserialization rejects unknown fields and fractional integers and bounds picks at 272 before iterating. Null-status games are excluded from the loaded playoff schedule, matching the Elo upcoming query.

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
| POST | `/playoffs/odds/backfill` | Required `season`; creates missing weekly Madden snapshots and returns `{season, created, skipped}` |
| POST | `/sync` | Incremental sync — skips historical seasons |
| POST | `/sync/force` | Re-syncs all seasons (~30 min, heavy API load) |
| POST | `/sync/verbose` | Sync with detailed per-game log (synchronous) |
| GET | `/sync/status` | `{lastSyncTime, message, success, inProgress, outcome}` |
| GET/PUT | `/sync/settings` | Persist interval and return check/change/next-run timestamps |
| POST | `/cache/warm` | Evict all caches, rebuild async |
| GET | `/cache/warm/status` | `{inProgress, message, completedAt, success}` |
| POST | `/sync/qb` | Sync QB and team game stats from NeonSportz; optional `?season=N` restricts the full resync to that season |
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

The UI follows Madden 27 tiebreakers and always requests `madden`; old `rules` UI parameters are ignored. The Probability tab uses `tab=probability`, accepting `tab=odds` as a legacy alias. API paths and JSON fields retain their existing names.

`playoffs.nfl-comparison` defaults to `false`: Picture and exact What-If compute only the requested rule set and return `otherRulesSeed: null`. Setting it to `true` restores the additional comparison pass. Explicit API requests with `rules=nfl` continue to work. Cache warming and weekly snapshots use Madden only; NFL requests remain on demand.

`SimulationService.simulate(state, probabilities, forced, simulations, seed, rules)` seeds the full league independently for each simulation and reduces integer counts on the shared compute executor. `Outcome` supports HOME, AWAY and forced TIE. Its `games` primitive exposes each simulated schedule for paired leverage; `outcomeGame` shares outcome-to-score conversion with future clinch integration. SplitMix64 counters depend only on base seed, simulation index and game ID, so forcing a game leaves every other game's outcome and margin unchanged. Unforced draws never tie. Losers score 20; margins 1, 3, 7, 10, 14 and 21 are equally likely; forced ties score 20-20. By default forced margins depend on seed and game ID alone, so fully forced schedules give exact 0/1 odds. The optional `varyForcedMargins` overload instead uses each simulation's existing margin counter, allowing What-If to model score-sensitive ties while preserving paired draws for unpicked games.

`OddsService` uses the selected season's latest Elo timeline ratings and the same `EloService.probability` plus home field as upcoming games. Teams without a timeline rating start at the configured initial rating. `playoffs.simulations` defaults to 20,000; the baseline seed is stable for season, next week and rules. Completed seasons use exact seeding with zero simulations. Unresolved NFL orders use the same alphabetical fallback as Picture, as documented in the API contract.

`LeverageService.matrix(season, week, rules)` returns an immutable `LeverageMatrix` with conditional odds for every team in every remaining game of the selected week (default next week). Each game runs HOME and AWAY with the same base seed and `playoffs.leverage-simulations` (default 5,000). `/api/playoffs/leverage` projects participants, importance summed over the full league, and up to five other teams ranked by their largest absolute goal swing. Empty weeks return an empty list, including completed seasons. Participant `current` is the exact Elo-weighted mixture of the two conditional runs; it can differ from `/odds` due to simulation noise.

Picture rows join the available cached season/rules baseline from `OddsService` without starting simulations; missing or failed odds are omitted without failing the Picture response. Elo configuration updates evict Picture and leverage alongside odds.

`ChampionshipService` uses the same `SimulationService` regular-season draws and season/week/rules seed as odds, then adds independent counter-based bracket draws. Seven teams qualify per conference: seed 1 receives a bye; 2 hosts 7, 3 hosts 6 and 4 hosts 5; the divisional round reseeds best against worst; the better seed hosts the conference final. The final is neutral. Matchup probabilities use unrounded ratings from the requested season’s latest Elo snapshot during the regular season, and its end-of-week-17 ratings thereafter with the configured home-field advantage, fixed throughout each simulated season. Regular-season probabilities retain the existing selected-season baseline behavior. Counts cover playoffs, round 2, conference final, final and champion. Completed seasons seed once from real scores and still simulate the bracket `playoffs.simulations` times. Both conferences must have seven seeds; incomplete bracket data returns 404.

`OddsHistoryService` reads `OddsSnapshotRepository` in week order and joins identities from the selected season schedule. Optional abbreviation filtering is case-insensitive. Completed-season rows stored as `next_week=-1` appear last with API `week: null`. Missing seasons return 404; seasons without saved rows return an empty list. The token-gated backfill visits weeks 0 through the current `nextWeek`, inclusive (or the week after the final completed week), preserving the preseason forecast even when only week 0 is complete. `SeasonStateLoader.loadAtStart` keeps real results only before that week and treats all later scheduled games as remaining, preserving stored game IDs and home/away sides. Elo probabilities use timeline `startElo` for that week, or the last earlier snapshot's `endElo` across gaps (season-start ratings before the first snapshot). Each run uses the baseline count and seed scheme with `nextWeek` set to the target week. The snapshot writer checks before computation, computes outside its lock and transaction, then rechecks and inserts inside a short synchronized transaction; any existing row skips the entire week and is never overwritten. Counts in the response count weeks, not team rows.

## Caching

Site caches keep the global Caffeine spec (maximum 500 entries, 24-hour expiry). `CacheNames.SITE` includes the pre-existing stats caches and cheap `playoffPicture`; the pipeline retains caches on idle polls and warming evicts through ALL.

Expensive playoff caches use per-cache Caffeine configuration in `CacheNames`: `playoffOdds`, `playoffBaseline`, `playoffChampionship`, `leverage`, `playoffClinch`, `playoffPath`, `playoffWhatIf` and `playoffScenarios`. They have size bounds only, without time expiry (128 entries, except eight shared baselines and two scenario classifications). Cache loaders use single-flight, including programmatic Caffeine loaders for shared baselines, What-If and scenarios. The ALL resolver includes both groups for explicit invalidation.

Every game/team-changing sync streams ordered scalar projections of all seasons' game IDs, status, scores, week, season, stage and participants, plus team IDs, abbreviations, display names, conference/division and Elo configuration into SHA-256; it does not load game entities. The single `sync_status` row stores `last_sync_at` and `last_fingerprint`. A changed fingerprint evicts expensive playoff caches after commit. The nontransactional pipeline then syncs QB weeks before evicting ALL and warming once. Idle polls update the successful timestamp without scanning the fingerprint. Startup always runs FULL and warms, even without changes. Failed syncs roll back partial writes, evict playoff caches after transaction completion and preserve the persisted fingerprint and last successful sync timestamp. Elo configuration changes also invalidate playoff caches. Invalidation advances a generation: odds, shared baselines and What-If cache keys include that generation so in-flight calculations cannot become current after a clear. What-If checks its captured generation under the invalidation monitor before publishing a baseline to the odds cache. Manual warming also advances the generation. Warming runs odds plus snapshot persistence, leverage, then Madden clinch; Path remains lazy. Playoff odds, leverage and clinch 404s (missing data) are expected skips logged at info. Other per-warmer failures produce `success=false` and list failed parts, while remaining warmers continue. Failed warming remains due for the next poll.

`ComputeGate` owns one bounded executor with `playoffs.max-concurrent-computations` threads (default two). Odds, championship, leverage, What-If, Path, clinch, scenarios and historical/backfill simulation share it. Nested CPU work executes inline on its existing worker. Cache hits bypass admission. Public admission waits `playoffs.compute-timeout-ms` (default 10,000); each admitted computation has `playoffs.compute-deadline-ms` (default 30,000). Timeout or saturation returns 503 with `Retry-After: 5`; cancellation interrupts the worker and hot loops check interruption. Warming waits for admission. Input/database reads occur before dispatching CPU work so workers do not inherit request transactions.

`playoffBaseline` contains the single season/rules 20,000-simulation result: qualification and seed counts, bracket advancement counts and final-win buckets for every team. Odds, Championship and Path's wins-needed rows share it. A completed regular season still simulates bracket outcomes, while the odds response retains exact 0/1 probabilities and zero regular-season simulations. Championship freezes Elo at the end of week 17 (`ratingsAtStart(season, 18)`) and returns `preplayoff: true` once no regular-season games remain.

Snapshot rows retain nullable internal `model_version`, `elo_config_hash`, `input_fingerprint` and `origin` (`live` or `backfill`) columns. The shared baseline captures provenance with its immutable schedule, probabilities and ratings in a repeatable-read input transaction before simulation. Historical runs capture the same inputs before computing. Provenance travels with the cached result into persistence, so later syncs/configuration changes cannot relabel earlier odds. History DTOs do not expose provenance. Backfill checks for an existing week first, simulates outside the writer lock and transaction, then rechecks and inserts in a short locked transaction.

## Data Sync

`SyncPipeline` coordinates QUICK, FULL and FORCE with a single-permit semaphore. Reservation happens before asynchronous dispatch, and completion publication and permit release share the same synchronized transition as acquisition. All admin sync/warm entry points, Elo configuration saves (operation "Elo recalculation") and probability backfill use this guard; busy calls return 409 with `Busy: <operation> is running`. Elo saves hold the guard through transaction completion and cache invalidation. Status includes `inProgress`, `outcome` (`running`, `completed`, `failed`), message and success. The pipeline itself is not transactional: game/status writes and each QB week commit before cache warming.

QUICK fetches league info once, then the earliest stored stage-1 week containing unplayed games and its next-lower stored week. This handles the missing playoff week 21. Without unplayed games it fetches the whole current season. Unknown teams escalate to FULL. League season, stage or week changes and the first run after startup also select FULL.

FULL fetches teams with `size=100`, saving only changed metadata, reconciles all current-season games and imports empty historical seasons. FORCE reprocesses every season. Existing historical game corrections require FORCE; upstream deletions and superseded games remain out of scope. New and edited games count as changes, with both old and new weeks marked when a game moves. League purges and team changes count too. `SyncStatusService.successful()` scans the input fingerprint only after game/team changes; idle success advances the timestamp without a scan.

`sync_settings` is a single persisted row (id 1), created by Hibernate `ddl-auto=update`. It stores `intervalMinutes`, `lastCheckedAt`, `lastChangedAt`, `lastFullSuccessAt` and league season/stage/week. `SYNC_INTERVAL_MINUTES` seeds the interval (default 120; any whole number 0-10080). GET `/api/admin/status` combines `{pipeline, qb, warm, settings}` for live admin polling; the existing `/api/admin/sync/status`, `/api/admin/sync/qb/status` and `/api/admin/cache/warm/status` endpoints remain available. Pipeline status is the single source of operation identity, `startedAt`, `completedAt` and outcome. The combined status samples phases under the pipeline transition monitor; QB/warm statuses supply only progress messages. Operation identity and start time are reserved before async dispatch; a locked request returns 409 with `Busy: <operation> is running`. GET/PUT `/api/admin/sync/settings` expose the interval, timestamps and `nextRunAt`; invalid values return 400. Off disables frequent polls. A one-minute scheduler ticker runs due polls; nightly FULL uses `SYNC_CRON` (4 AM ET) and remains due after overlap until FULL succeeds. Startup FULL always warms. This assumes one Railway instance, since the guard and caches are local to the process.

Changed data evicts through `CacheNames.ALL` and warms site and playoff caches once, after QB writes. Identical QB/team refetches preserve existing rows and caches; only changed rows trigger warming. Warming includes TeamEfficiency and seasonal QB REGULAR, PLAYOFFS and BOTH tables. Manual warming remains available. Public `GET /api/sync/status` reads the persisted last successful game sync timestamp without caching.

`nsPk` is the NeonSportz URL key; `gameId` is an external ref ID used for deduplication, never URLs. The client follows upstream pagination links until null.

### QB and team stat sync

Every poll checks database QB existence and team-row counts for completed weeks. Missing/short weeks, changed game weeks and failed weeks are fetched; idle polls make no stat HTTP requests. FULL additionally refreshes the current/previous stored weeks, or the latest two at season end, to catch missing passers and corrected kicking/punting values that row counts cannot detect. Each fetch reads passing, rushing, team, kicking and punting feeds with `size=100`. Throttling waits and retries up to six times.

`QbStatsWeekWriter` replaces one week of QB and team rows together in a transaction. Its cache eviction happens before the pipeline warms, leaving QB and efficiency caches populated at completion. Traded passers are reassigned only when sack totals and nonnegative yard gaps identify a unique best move; rushing rows follow them. `/api/admin/sync/qb` manually rewrites all seasons, or just `?season=N`, under the same guard, then warms. Committed manual repairs advance `sync_settings.lastChangedAt`, including weeks committed before a later failure; unchanged repairs preserve it. QB sync always clears its running state and publishes failure after exceptions or errors, and overlapping calls fail explicitly.

## N+1 Prevention

`GameEntity` has `@ManyToOne(EAGER)` on both team associations, but JPQL does **not** join eagerly — Hibernate fires separate SELECT per association. Every game-loading JPQL query must include:

```sql
LEFT JOIN FETCH g.homeTeam LEFT JOIN FETCH g.awayTeam
```

Omitting this causes 1 + 2N queries per load (289 queries for 144-game season → ~30s on Railway).

### Path to the Playoffs

`GET /api/playoffs/path/{abbr}` accepts optional `season` and `rules` (Madden by default). `PathService` combines cached baseline odds and proven clinch markers with fresh win-out simulations. Unknown teams or seasons return 404; invalid rules return 400. `simulations` is the baseline sample count. `playoffs.path-simulations` defaults to 10,000 for win-out runs; all draws use the baseline season/week/rules seed, with varying forced margins.

`SimulationService` accumulates compact final-win buckets for all teams in the shared baseline pass. Path reads those buckets without repeating the baseline simulation. The conditioned Path run also collects win buckets; leverage, What-If and ordinary untracked simulations skip bucket allocation and accumulation. Final-record rows below 0.5% probability are omitted. The ceiling takes the best nonzero seed across baseline and win-out distributions, subject to proven markers, and retains the baseline seed distribution.

Constrained `ClinchAnalyzer` accepts a matchup-to-outcome map. Fixed results contribute to both record bounds and restrict search branches, while their unknown margins remain part of the conservative ambiguity analysis. `controlsDestiny` requires a proven playoff clinch under win-out constraints; search caps, incomplete schedules, timeouts and NFL rules retain the constrained record-math fallback.

Leverage resolves season and week before cache lookup, so omitted and explicit defaults share one matrix. Weekly rooting uses the cached full `LeverageMatrix`. Win-out risks condition the one win-out run on each candidate game result, accumulating P(playoffs | home win) and P(playoffs | away win). Conditioned estimates require at least 50 samples of each outcome. Below that threshold, at most ten candidates receive paired forced runs of 1,500 simulations per outcome, ranked by the earlier absolute swing estimate or probability closeness when no estimate exists; other undersampled candidates are omitted. Candidates include games with at least one other team in the selected team's conference, including cross-conference games, and exclude the selected team's games. Only the nearest 40 candidates by week then game ID are evaluated. Both lists keep the five largest absolute playoff swings of at least 0.02; swing is home-win minus away-win odds.

`playoffPath` caches lazily by `(resolved season, abbreviation, rules)`, participates in `allStatsCaches` eviction and Elo configuration eviction, and is never warmed. Path shares the configurable playoff compute gate; excess uncached team requests receive 503 after the admission timeout. Cached responses remain available while another analysis runs.

`ScenarioService` adds final-week `scenarios` to the cached Path response when 1–16 regular-season games remain league-wide and every team has exactly 17 scheduled games, using the same validation as `ClinchAnalyzer`. It exhaustively seeds all 2^n win/loss outcomes with Madden or NFL Picture rules, once for every team and goal on the shared compute executor, cached in `playoffScenarios` until inputs change. Synthetic 1–0 scores and the shared clinch ambiguity/achievement helpers classify each goal as IN, OUT or UNKNOWN; ambiguous decisions conservatively suppress claims throughout their conference. Status uses all outcomes, including UNKNOWN as neither IN nor OUT.

For each goal, only games that change that three-way classification are relevant. At most 12 relevant variables are minimized with a ternary cofactor table (O(r × 3^r) time, O(3^r) space); larger sets retain the exact status with empty condition lists. UNKNOWN is excluded from both sufficient sets. All prime implicants are derived before sorting by condition count and text and returning at most six per list. Settled goals have empty lists. Conditions use display names with winner-first “X beat Y” wording, including the focus team's games. NFL seeding precomputes each team's overall record once per outcome for reuse in win-percentage and opponent-strength comparisons. Path requests reuse the cached classification and minimize only their own team’s conditions; `playoffPath` also stores the complete response including scenarios.
