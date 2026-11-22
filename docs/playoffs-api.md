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
          "otherRulesSeed": 1,
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
- `otherRulesSeed`: seed (1-7) the team would hold under the other rule set (`nfl` when `rules=madden`, and the reverse), or null when it would miss the playoffs.
- `reasons` is empty when no tiebreaker was needed. Sentences are plain English with team names, no internal jargon.
- `throughWeek` is the last week with a completed regular-season game (null if none); `nextWeek` is the earliest week with an unplayed regular-season game (null once the regular season is complete).
- Phase 2 adds `odds` (`{ "playoffs": 0.64, "division": 0.31, "oneSeed": 0.03 }`, fractions) to each seed/hunt row; the UI renders it when present.

## GET /api/playoffs/odds

Query: `season` (optional, default current), `rules` = `madden` (default) | `nfl`.
Baseline Monte Carlo over remaining regular-season games (Elo + home field win probability, no simulated ties). Cached; recomputed after each sync.

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
The Picture endpoint rows gain the same `odds` object (added after Phase 2's first merge; until then Picture rows have no `odds`).

## GET /api/playoffs/leverage

Query: `season`, `week` (optional, default `nextWeek`), `rules`.
Paired simulations: each game forced as a home win and as an away win with every other game's random draw identical.

```json
{
  "season": 2, "week": 11, "rules": "madden", "simulations": 4000, "computedAt": "...",
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
`season` optional (default current), `rules` default `madden`, `result` is `home` | `away` | `tie`, `simulations` optional (default 5000, max 20000). Validation (400): unknown gameId (not a remaining regular-season game of that season), duplicate gameId, bad `result`, unknown rules, simulations out of range. Picks are forced; every other remaining game is simulated on the same random draws as the baseline run (fresh simulation, never a filtered baseline).

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
When every remaining game is picked (`exact: true`) there is one outcome: `seeds` is the final seeding (same row shape as the Picture endpoint `seeds`, including `reasons`) and each row additionally has `dependsOnScores` (boolean): true when a tiebreak that decided that team's position used point differential, a coin toss or the arbitrary alphabetical fallback, because picks specify winners but not scores. `odds` are then exactly 0 or 1 for rows not marked `dependsOnScores`; for flagged rows the odds come from simulating margins (so they may be fractional). `seeds` is null when `exact` is false.

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
