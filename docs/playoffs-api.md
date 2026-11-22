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
- `otherRulesSeed`: seed (1-7) the team would hold under the other rule set (`nfl` when `rules=madden`, and the reverse), or null when it would miss the playoffs.
- `reasons` is empty when no tiebreaker was needed. Sentences are plain English with team names, no internal jargon.
- `throughWeek` is the last week with a completed regular-season game (null if none); `nextWeek` is the earliest week with an unplayed regular-season game (null once the regular season is complete).
- Phase 2 adds `odds` (`{ "playoffs": 0.64, "division": 0.31, "oneSeed": 0.03 }`, fractions) to each seed/hunt row; the UI renders it when present.
