# Playoffs API (contract for the playoff suite)

Source of truth for the shapes shared by backend and frontend. Later phases append endpoints here.
Season is the 0-based season index (display with `seasonLabel`, index + 103). Weeks are 0-based `weekIndex` (regular season 0-17). `team` objects use the same shape as `EloService.Team`: `{ "teamId": 1, "abbrName": "NYG", "displayName": "Giants" }`.

## GET /api/playoffs/picture

Query: `season` (optional, default = current season), `rules` = `madden` (default) | `nfl`.
Unknown `rules` -> 400. Season with no data -> 404.

"If the season ended today": completed regular-season games only (stageIndex 1, weeks 0-17, status >= 2), end-of-season tiebreak rules applied.

```json
{
  "season": 2,
  "rules": "madden",
  "throughWeek": 10,
  "nextWeek": 11,
  "gamesPlayed": 176,
  "gamesRemaining": 80,
  "conferences": [
    {
      "name": "AFC",
      "seeds": [
        {
          "seed": 1,
          "team": { "teamId": 1, "abbrName": "BUF", "displayName": "Bills" },
          "division": "AFC East",
          "divisionWinner": true,
          "wins": 9, "losses": 2, "ties": 0,
          "otherRulesSeed": null,
          "reasons": ["plain-English sentence about a tiebreak that decided this team's place"]
        }
      ],
      "hunt": [
        { "rank": 8, "team": {}, "division": "AFC South", "divisionWinner": false, "wins": 6, "losses": 5, "ties": 0, "otherRulesSeed": null, "reasons": [] }
      ]
    }
  ]
}
```

- `seeds` has exactly 7 entries per conference (when at least 7 teams exist), seeds 1-4 are division winners.
- `hunt` is every remaining team in order (`rank` 8...).
- Unresolved NFL ties use alphabetical order within each tied rank, including division ties, so both conferences still render. Affected teams receive a reason explaining that the displayed order is arbitrary and the NFL uses a coin toss.
- `otherRulesSeed`: null by default. Set `playoffs.nfl-comparison=true` to compute the other rule set (`nfl` when `rules=madden`, and the reverse); then this is its seed (1–7), or null when it would miss the playoffs. The default `false` skips the extra seeding pass in Picture and exact What-If. Explicit `rules=nfl` requests still compute NFL seeding, with no comparison pass unless enabled. The frontend always requests `madden` and ignores old `rules` URL parameters.
- `reasons` is empty when no tiebreaker was needed. Sentences are plain English with team names, no internal jargon.
- `throughWeek` is the last week with a completed regular-season game (null if none); `nextWeek` is the earliest week with an unplayed regular-season game (null once the regular season is complete).
- Phase 2 adds `odds` (`{ "playoffs": 0.64, "division": 0.31, "oneSeed": 0.03 }`, fractions) to each seed/hunt row; the UI renders it when present.

## GET /api/playoffs/odds

Query: `season` (optional, default current), `rules` = `madden` (default) | `nfl`.
Baseline Monte Carlo over remaining regular-season games (Elo + home field win probability, no simulated ties). Cached; recomputed when sync inputs or the Elo configuration change.

```json
{
  "season": 2, "rules": "madden", "throughWeek": 10, "nextWeek": 11,
  "simulations": 20000, "computedAt": "2026-11-22T03:00:00Z",
  "conferences": [
    { "name": "AFC",
      "teams": [
        { "team": { "teamId": 1, "abbrName": "BUF", "displayName": "Bills" },
          "division": "AFC East", "wins": 9, "losses": 2, "ties": 0,
          "odds": { "playoffs": 0.99, "division": 0.93, "oneSeed": 0.41 },
          "seedOdds": [0.41, 0.2, 0.15, 0.1, 0.07, 0.04, 0.02]
        }
      ] }
  ]
}
```
Odds are fractions (UI rounds to whole percents and shows ">99%" / "<1%" instead of 100% / 0%). Teams sorted by playoffs odds descending. Within a conference playoffs odds sum to 7 and oneSeed odds to 1 (up to rounding).
Under `rules=nfl`, orders the real NFL would settle by coin toss are resolved alphabetically (same as Picture).

The Picture endpoint rows gain the same `odds` object (added after Phase 2's first merge; until then Picture rows have no `odds`).

## GET /api/playoffs/leverage

Query: `season`, `week` (optional, default `nextWeek`), `rules`.
Paired simulations: each game forced as a home win and as an away win with every other game's random draw identical. `playoffs.leverage-simulations` defaults to 5,000 per side.

```json
{
  "season": 2, "week": 11, "rules": "madden", "simulations": 5000, "computedAt": "...",
  "games": [
    { "gameId": 123, "home": { "teamId": 1, "abbrName": "NYG", "displayName": "Giants" },
      "away": { "teamId": 2, "abbrName": "JAX", "displayName": "Jaguars" },
      "homeWinProb": 0.58,
      "teams": [
        { "team": {}, "side": "home",
          "current": { "playoffs": 0.64, "division": 0.31, "oneSeed": 0.03 },
          "ifWin":   { "playoffs": 0.73, "division": 0.40, "oneSeed": 0.04 },
          "ifLoss":  { "playoffs": 0.46, "division": 0.18, "oneSeed": 0.01 } },
        { "side": "away" }
      ],
      "importance": { "playoffs": 0.31, "division": 0.22, "oneSeed": 0.05 },
      "others": [ { "team": {}, "goal": "playoffs", "swing": -0.04 } ]
    }
  ]
}
```
`importance` = sum over all teams of |P(goal | home win) - P(goal | away win)| / 2 (so playoff importance is "how many playoff spots' worth of probability moves"). `others` = up to 5 non-participant teams with the largest absolute swing across goals (swing is that team's P(goal | home win) - P(goal | away win), positive = helped by a home win). `current` etc. are from the participant's perspective.

## GET /api/playoffs/calibration

How accurate the Elo pregame win probabilities were on completed regular-season games of the selected seasons (Madden 27 launch onward; `season` optional, default all).
```json
{ "games": 2500, "brier": 0.2, "coinFlipBrier": 0.25,
  "buckets": [ { "low": 0.5, "high": 0.6, "games": 400, "predicted": 0.55, "actual": 0.57 } ] }
```

Calibration buckets are over the home team's pregame win probability in 0.1 steps; `predicted` is the mean probability, `actual` the home win rate (a tie counts half). `brier` is the mean squared error of the home win probability against the home result.

## GET /api/playoffs/clinch

Query: `season` (optional, default current), `rules` = `madden` (default) | `nfl` (nfl: record-math layer only).
Proven markers only; `null` means "not established", never "no". Computed after each sync (cached).

```json
{
  "season": 2, "rules": "madden", "exhaustive": true,
  "teams": [
    { "team": { "teamId": 1, "abbrName": "BUF", "displayName": "Bills" },
      "playoffs": "clinched", "division": null, "oneSeed": "eliminated" }
  ]
}
```
Marker values: `"clinched"`, `"eliminated"`, or null. `exhaustive` is true when the full outcome search ran (false = record math only). Every team in the league has a row.

## GET /api/playoffs/remaining

Query: `season` (optional), `rules` not needed. Remaining regular-season games for the What-If picker.

```json
{ "season": 2, "nextWeek": 11,
  "games": [ { "gameId": 123, "week": 11,
               "home": { "teamId": 1, "abbrName": "NYG", "displayName": "Giants" },
               "away": { "teamId": 2, "abbrName": "JAX", "displayName": "Jaguars" },
               "homeWinProb": 0.58 } ] }
```
Sorted by week then gameId.

## POST /api/playoffs/simulate (What-If)

Body:
```json
{ "season": 2, "rules": "madden",
  "picks": [ { "gameId": 123, "result": "home" }, { "gameId": 124, "result": "tie" } ],
  "simulations": 5000 }
```
`season` optional (default current), `rules` default `madden`, `result` is `home` | `away` | `tie`, `simulations` optional (default the baseline’s `playoffs.simulations` count, normally 20000; min 1, max 20000). Validation (400): unknown JSON properties, fractional gameId or simulations, more than 272 picks (or more picks than remaining games), unknown gameId (not a remaining regular-season game of that season), duplicate gameId, bad `result`, unknown rules, simulations out of range. Picks are forced; every other remaining game is simulated on the same random draws as the baseline run (fresh simulation, never a filtered baseline). Empty picks return the baseline odds and seed odds unchanged, so all deltas are exactly zero even with an explicit lower simulation count. Lower counts are allowed for picked runs but can add Monte Carlo noise to deltas, including for teams unaffected by the picks.

Identical requests (season, rules, sorted picks, simulation count) share a bounded 128-result Caffeine cache, evicted when sync inputs change and on Elo configuration changes. The shared playoff compute gate allows two cold calculations by default across simulation, Path, leverage, championship, baseline odds, clinch, scenarios and historical/backfill odds; extra calculations wait up to 10 seconds, then return 503 with `Retry-After: 5` and the plain message `Playoff simulations are busy; try again shortly`. Admitted calculations have a 30-second deadline (`playoffs.compute-deadline-ms`) and return the same 503 on timeout. Remaining schedules exclude games with unknown (null) status, matching Elo’s upcoming-game query.

Response:
```json
{
  "season": 2, "rules": "madden", "picked": 12, "remaining": 80, "simulations": 5000,
  "exact": false,
  "conferences": [
    { "name": "AFC",
      "teams": [ { "team": {}, "division": "AFC East",
                   "odds": { "playoffs": 0.99, "division": 0.93, "oneSeed": 0.41 },
                   "baseline": { "playoffs": 0.97, "division": 0.9, "oneSeed": 0.35 },
                   "seedOdds": [0.41, 0.2, 0.15, 0.1, 0.07, 0.04, 0.02] } ],
      "seeds": null } ] }
```
When every remaining game is picked (`exact: true`) there is one outcome: `seeds` is the final seeding (same row shape as the Picture endpoint `seeds`, including `reasons`) and each row additionally has `dependsOnScores` (boolean): true when a tiebreak that decided that team's position used point differential, a coin toss or the arbitrary alphabetical fallback, because picks specify winners but not scores. `odds` are then exactly 0 or 1 for rows not marked `dependsOnScores`; score-dependent cascades are also flagged when margin simulations produce fractional playoff, division or one-seed odds. If no teams are flagged, the forced simulation is skipped. For flagged rows the odds come from simulating margins (so they may be fractional). `seeds` is null when `exact` is false. Exact seed rows return `otherRulesSeed: null` unless `playoffs.nfl-comparison=true`. Each `teams[]` row also exposes `dependsOnScores`, flagging exact-mode odds that depend on unresolved scores or fractional simulated counts, including teams outside `seeds[]`.

## Odds on the Picture endpoint

GET /api/playoffs/picture rows gain `odds` ({playoffs, division, oneSeed} fractions, same values as /odds for the same season and rules) when a baseline run exists, otherwise the field is omitted.

## Leverage full matrix and Path to the Playoffs

Leverage computation keeps, for every game of the week and every team in the league, P(goal | home win) and P(goal | away win). /leverage exposes the two participants and the top `others` as before. `GET /api/playoffs/path/{abbr}` (season, rules optional) uses the full matrix and fresh forced runs:

```json
{
  "season": 2, "rules": "madden", "team": { "teamId": 1, "abbrName": "NYG", "displayName": "Giants" },
  "wins": 7, "losses": 4, "ties": 0, "remainingGames": 6, "simulations": 5000,
  "current": { "playoffs": 0.64, "division": 0.31, "oneSeed": 0.03 },
  "markers": { "playoffs": null, "division": null, "oneSeed": "eliminated" },
  "winOut": { "playoffs": 0.97, "division": 0.7, "oneSeed": 0.1, "controlsDestiny": false },
  "ceiling": { "bestSeed": 2, "seedOdds": [0.0, 0.05, 0.1, 0.2, 0.25, 0.2, 0.15] },
  "winsNeeded": [ { "finalWins": 13, "record": "13-4", "chance": 0.1, "playoffs": 0.97, "division": 0.7, "oneSeed": 0.1 } ],
  "winOutRisks": [ { "gameId": 130, "week": 14, "home": {}, "away": {}, "rootFor": "away", "swing": -0.09 } ],
  "rootThisWeek": [ { "gameId": 125, "home": {}, "away": {}, "rootFor": "home", "swing": 0.04 } ]
}
```
- `controlsDestiny`: true only when winning every remaining game is PROVEN to make the playoffs in every outcome of the other games (uses the clinch analyzer on a season with the team's games decided as wins); otherwise false (the UI then says "can still miss" or "not proven").
- `bestSeed`: best seed with non-zero simulated probability, null when eliminated; never better than a proven marker allows.
- `winsNeeded`: one row per achievable final win total, from the baseline run (`chance` = probability of that final record); rows with chance under 0.5% omitted.
- `winOutRisks`: games of other teams, ranked by absolute swing on this team's playoff odds GIVEN the team wins out, `rootFor` = side that helps; top 5, swing under 0.02 omitted.
- `rootThisWeek`: this week's games not involving the team, ranked by absolute swing on its playoff odds, top 5, swing under 0.02 omitted.

Path implementation limits: `simulations` reports the baseline sample count (zero for a completed season). Win-out uses one `playoffs.path-simulations` run (default 10,000); risks condition this same run on each candidate game's home/away result. Risk candidates are capped at the nearest 40 games ordered by week then game ID, including cross-conference games involving another conference member. The shared compute gate admits two cold computations by default; excess requests return 503 after the admission timeout. Responses are cached lazily and never warmed. Wins-needed buckets reuse the shared odds/championship baseline. Final-week outcome classification is computed once for every team and goal and reused across Path requests until inputs change.

## GET /api/playoffs/odds/history

Query: `season` (optional, default current), `team` (optional abbreviation; default all teams). Saved weekly snapshots (Madden rules), oldest first.
```json
{ "season": 2,
  "snapshots": [ { "week": 11, "computedAt": "2026-11-18T03:00:00Z", "simulations": 20000,
                   "teams": [ { "team": { "teamId": 1, "abbrName": "NYG", "displayName": "Giants" },
                                "playoffs": 0.64, "division": 0.31, "oneSeed": 0.03 } ] } ] }
```
`week` is the `nextWeek` the snapshot was taken for; a completed-season snapshot has `week: null` and follows the numbered weeks. Weeks without a snapshot are absent (no interpolation). `POST /api/admin/playoffs/odds/backfill?season=` (admin token) re-simulates forecasts from preseason week 0 through the current next week, inclusive, using the Elo ratings as of that week and stores any missing snapshot rows (never overwrites an existing snapshot); returns `{ "season": 2, "created": 9, "skipped": 2 }`.

## GET /api/playoffs/championship

Query: `season`, `rules`. Extends each baseline simulation through the bracket (7 seeds per conference, seed 1 gets a bye, wild-card round 2v7 3v6 4v5, then the top remaining seed hosts the lowest remaining, conference final, final). Playoff game win probability = Elo with home-field advantage for the better seed (neutral site for the final), ratings fixed within a simulated season; no ties.
```json
{ "season": 2, "rules": "madden", "simulations": 20000, "computedAt": "...",
  "teams": [ { "team": {}, "conference": "AFC",
               "playoffs": 0.97, "round2": 0.71, "conferenceFinal": 0.44, "final": 0.27, "champion": 0.15 } ] }
```
`round2` = reaches the second round (bye or wild-card win), then `conferenceFinal`, `final`, `champion`. Sorted by `champion` descending. Sum of `champion` is 1; sum of `final` is 2.

## Path: final-week scenarios (`scenarios` field of GET /api/playoffs/path/{abbr})

`scenarios` is null unless at least 1 and at most 16 regular-season games remain league-wide. When present it lists plain-English conditions proven by exhaustive win/loss enumeration of every remaining game (2^n outcomes, no tie games assumed, scores unknown: any outcome whose result for the team's goal depends on point differential, a coin toss or the alphabetical fallback counts as "not proven in" and "not proven out").
```json
"scenarios": {
  "remainingGames": 3,
  "assumes": "No tie games; point-differential tiebreaks are treated as unknown",
  "goals": {
    "playoffs": {
      "status": "open",
      "clinchedBy": [ { "text": "Giants beat Jaguars", "conditions": [ { "gameId": 123, "winner": "NYG" } ] },
                      { "text": "Lions lose to Buccaneers and Panthers lose to Ravens",
                        "conditions": [ { "gameId": 130, "winner": "TB" }, { "gameId": 131, "winner": "BAL" } ] } ],
      "eliminatedBy": [ { "text": "Giants lose to Jaguars and Lions beat Buccaneers", "conditions": [] } ]
    },
    "division": { "status": "open", "clinchedBy": [], "eliminatedBy": [] },
    "oneSeed":  { "status": "out",  "clinchedBy": [], "eliminatedBy": [] }
  }
}
```
- `status`: `in` (in every outcome), `out` (out in every outcome), `open` otherwise.
- `clinchedBy` = minimal sufficient sets of game results (prime implicants of the "definitely achieved" outcomes), `eliminatedBy` = minimal sets that make the goal impossible. Each has `text` (team display names, "beat" / "lose to" wording, game results joined with "and") and `conditions` (`winner` = team abbreviation). At most 6 entries each, shortest first, then alphabetical; empty list when none exist. `status: "in"` has `clinchedBy: []` (no condition needed) and `status: "out"` has `eliminatedBy: []`.
- Only games that can change the answer appear in conditions.

## GET /api/sync/status

Public. Last successful data sync (persisted, survives restarts).
```json
{ "lastSyncAt": "2026-11-22T09:02:11Z" }
```
`lastSyncAt` is null when no successful sync has been recorded. The site footer shows it ("Last synced Nov 22, 4:02 AM ET") and falls back to the static schedule line when null.

## Championship: pre-playoff label

`GET /api/playoffs/championship` gains `"preplayoff": true|false`: true when no regular-season games remain (the field is then a frozen pre-playoff projection, not live odds). In that state the bracket uses Elo ratings as of the end of the regular season (not ratings updated by playoff games) so the favourite does not drift during the postseason. The UI keeps showing the table and labels it "Pre-playoff projection (end of regular season)".
