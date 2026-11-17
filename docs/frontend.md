# Frontend

## Frontend Pages

Routes: `/` Home, `/standings`, `/games`, `/elo`, `/qb`, `/about`, `/admin`. The `RZS Stats` wordmark links to `/`. `/trends` no longer has a page — it redirects to `/standings?tab=history`, so old links and bookmarks keep working.

### HomePage
Landing page at `/`. Leads with **Best Games Ahead** — the five closest unplayed games league-wide, ranked by the favorite's win probability (closest to a coin flip first, week ascending as tiebreak), linking to `/elo?tab=games`. Below it, one preview card per section (Standings, Games, Elo, QBs, Trends, About) in a 3-column grid; each card is a `Link` to its page. The Trends card has no page of its own — it links to `/standings?tab=weekly`. Every section fetches independently so one failed request doesn't blank the page — top 5 by PyPAT, latest week's scores, top 5 Elo with biggest riser, top 5 QBs by TANY/A, and a mini PyPAT line chart for the top 4 teams.

The Best Games table mirrors the Elo **Projected** table — same columns, `LeanBar`, Outlook tiers and shading — by importing the same helpers rather than restating them. **The tier thresholds, colors and `lean()` live only in [utils/eloLean.js](../frontend/src/utils/eloLean.js)**; change them there and both tables move together.

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

### QbPage
Two tabs:
- **Leaderboard**: Every QB by TANY/A. Column *presets* (efficiency / classic / rushing / all) control which of `ALL_COLS` render. Regular / Playoffs / Both toggle, `minAtt` input, "show unqualified" checkbox. Unqualified rows render at 50% opacity with no rank. CSV + Excel export.
- **Movement**: Biggest risers and fallers over a configurable window, plus a rank-by-week chart (season or all-time basis).

QB names link to the player's NeonSportz page via `rosterId`.

### AdminPage
Passcode gate driven by `GET /api/admin/auth`. Sync controls (incremental + force with confirmation modal, QB sync), cache warming with live progress polling (2s interval while `inProgress=true`), Elo config editor, sync status display. Footer shows nightly sync schedule.

### AboutPage
Card grids for stat definitions (PyPAT, Luck, SoS, Elo, TANY/A, RUSH+) and per-page descriptions. Data sync banner. Resource links (videos, blog posts, external references). **Adding a stat or a page means adding it here too** — this page is the user-facing contract for what every number means.

## Indexing & Display Conventions

- **Season index**: 0-based. Frontend displays the league season number via `utils/seasons.js`: `index + 103` (e.g. index 0 → "Season 103")
- **Week index**: 0-based. Regular season: weeks 0–17
- **Stage index**: 0 = preseason, 1 = regular season + playoffs (playoffs = weekIndex 18+); stats queries cap regular season at week 17
- **Game status**: ≥2 = completed and counted; <2 = unplayed/future
- **Tied games**: Each team gets 0.5 wins toward record and expected wins
- **PyPAT rounding**: stored to 4 decimal places (`Math.round(val * 10000.0) / 10000.0`)
- **All values are nullable** for SoS fields, including SoS Played — null means no data (no games played yet, no future opponents, or no opponent ratable after H2H exclusion)
