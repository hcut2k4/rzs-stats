# Frontend

## Frontend Pages

Routes: `/` Home, `/standings`, `/efficiency`, `/games`, `/elo`, `/qb`, `/about`, `/admin`. The `RZS Stats` wordmark links to `/`. `/trends` no longer has a page — it redirects to `/standings?tab=history`, so old links and bookmarks keep working.

### HomePage
Landing page at `/`. Leads with **Best Games Ahead** — the five closest unplayed games league-wide, ranked by the favorite's win probability (closest to a coin flip first, week ascending as tiebreak), linking to `/elo?tab=games`. Below it, one preview card per section (Standings, Efficiency, Games, Elo, QBs, Trends, About) in a 3-column grid; each card is a `Link` to its page. The Trends card has no page of its own — it links to `/standings?tab=weekly`. Every section fetches independently so one failed request doesn't blank the page — top 5 by PyPAT, latest week's scores, top 5 Elo with biggest riser, top 5 QBs by TANY/A, and a mini PyPAT line chart for the top 4 teams.

The Best Games table mirrors the Elo **Projected** table — same columns, `LeanBar`, Outlook tiers and shading — by importing the same helpers rather than restating them. **The tier thresholds, colors and `lean()` live only in [utils/eloLean.js](../frontend/src/utils/eloLean.js)**; change them there and both tables move together.

### StandingsPage
Three tabs, with the active one held in the URL as `?tab=standings|history|weekly` (`standings` omits the param) — same contract as EloPage: deep links work, an unknown value falls back to Standings, and tab switches use `replace`. The season picker lives in the header and is shared by Standings and Week by Week; it is hidden on Season History, which spans every season. The header qualifier is per-tab. Group-by-conference and the SoS toggle are Standings-tab controls and render below the tab row, not in the header.
- **Standings**: Sortable by any column (click header, click again to reverse). Default sort: PyPAT descending. Heat colors: green = good (PyPAT, Win%, Avg PF), red = bad (Avg PA, SoS), diverging blue/green = Luck. Sticky rank + team columns for mobile scroll. SoS toggle appears only for the active season. Exports via `ExportMenu` (visible on mobile). Each conference block exports only its own teams. A standings response for a season the user has already switched away from is ignored. If the season list itself fails to load, the error shows on Week by Week too rather than "No data available."
- **Season History**: Table of all seasons, W-L + PyPAT + Luck per team. Sortable by clicking any season's column header. `/trends/season` returns every season × every team, so it is fetched only when this tab is first opened, then held in page state — never on a plain Standings visit. A failed fetch shows an error with a Retry button rather than an empty table. The tab mounts only once the data is in, so its default sort (latest season, W-L) initializes against real data.
- **Week by Week**: Recharts line chart, cumulative PyPAT by week. Click teams to highlight them; the rest fade back. A response for a season the user has already switched away from is ignored, and a failed load shows an error instead of the previous season's chart.

### EfficiencyPage
Three tabs, with the active one held in the URL as `?tab=overview|offense|defense` (`overview` omits the param; an unknown value falls back to it; switches use `replace`). The header holds the season picker and a Regular / Playoffs / Both toggle, which maps to the named `stage` enum like the QB page. Data comes from one `GET /api/efficiency` call per season and stage; a response for a season or stage the user has switched away from is ignored.
- **Overview**: Recharts scatter of offense Pts/Drive (x) against defense Pts/Drive allowed (y, reversed so up is good), with team logos as markers and dashed league-average lines, over a sortable table led by Net Pts/Drive.
- **Offense / Defense**: One `SideTab`, driven by the `METRICS` array. The Defense tab reads each row's `defense` side and flips which direction is good, so heat colors always mean green = better. Team column is sticky.

Sorting uses the shared `useSorter` / `SortTh` in [components/SortTh.jsx](../frontend/src/components/SortTh.jsx); nulls always sort last. Every header carries a tooltip. An empty response shows "No team stats yet", because these rows only exist after the player and team stat sync has run.

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
- **Leaderboard**: Every QB by TANY/A. Column *presets* (efficiency / classic / rushing / all) control which of `ALL_COLS` render. Regular / Playoffs / Both toggle, `minAtt` input, "show unqualified" checkbox. Unqualified rows render at 50% opacity with no rank. Exports follow the active preset's columns; an unqualified QB exports an empty `#`.
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

## Exports

Every table and data list renders `<ExportMenu spec={...} />` ([components/ExportMenu.jsx](../frontend/src/components/ExportMenu.jsx)): four inline buttons, XLSX / CSV / PNG / AI, visible on mobile. **A new table or data list gets one.** All logic lives in [utils/exportTable.js](../frontend/src/utils/exportTable.js) (CSV, XLSX, AI text) and [utils/tableImage.js](../frontend/src/utils/tableImage.js) (PNG); pages only build a spec.

```js
{ name, qualifier, description, notes, rows,
  cols: [{ label, group, desc, text, value, z, color, align, keepText }],
  api: { path, params, fields, note } }
```

- **Build it from the page's own state**: `rows` is exactly what is on screen (filtered, sorted, preset-reduced) and `qualifier` describes that slice, so never reuse a header phrase that stops being true after a re-sort.
- **Pages with a `COLS` array** call `specCols(COLS, cellColor)`. A column whose `fmt` returns JSX **must declare `tx`**, the plain-text version; a `tx` column with no `value` is text-only. `exportLabel` replaces `label` in the CSV/AI header where the on-screen header leans on a group band (`SoS Played`, not `Played`). **Pages without one** (all of EloPage) declare an export-only spec beside the table instead of refactoring the table to render from it.
- **Missing is decided from `value()` before formatting**, never recovered from text: on-screen formatters render null as an em-dash, which must not reach a CSV. A null, undefined or NaN value is an empty cell; zero-denominator rates need an explicit `value` returning null so they are empty, not 0. `keepText` is for text that carries meaning, such as `n/a` for TD:INT.
- **Excel gets a typed number only when a column has both `value` and `z`** (a SheetJS format such as `0.0%`); a bare number would show `0.681` where the site shows `68.1%`. Without `z` the cell is the text.
- **Every column needs a `desc`**: the AI export prints it as the column definition. Reuse the tooltip / `TIPS` / `METRICS` text rather than writing a second copy.
- **`api.params` must come from the same response as `rows`.** Store the resolved params with the rows when a response lands and guard against out-of-order responses (see StandingsPage); never read them from live UI state. `preset`, sort and other client-only state go in `api.note`, not in params.

### The AI export
A markdown block meant to be pasted into an AI chat: a league primer, what the table is, one definition per column, the full dataset as a fenced CSV, then the public REST API: the exact `GET` URL that produced the table, how each derived column maps to the raw API fields, a list of related endpoints, and the conventions an assistant gets wrong without being told. The base URL is `window.location.origin`, so a dev build emits `localhost`. The API is unauthenticated, so an assistant can re-fetch fresh data itself.

The conventions text (`CONVENTIONS` in `exportTable.js`) was checked against the backend and must be re-checked when an endpoint changes. The easy mistakes: `/api/games` takes a **numeric** `stage` (`2` = playoffs), while `/api/qb/*` and `/api/efficiency` take a **named** one (`regular|playoffs|both`; a number is a 400); `season` is a 0-based index and `/api/games` also requires `week`.

### The image export
`tableImage.js` draws the table on a canvas rather than capturing the DOM, so sticky columns, horizontal scroll and cross-origin logos cannot clip or taint it. It is always light-themed (heat colors are low-alpha tints that composite over white) and has no logos. Size is checked on width, height and area before the canvas is allocated: it tries 2x, then 1x, then reports `Too big` (iOS Safari's ~16.7M px canvas is the binding limit). The clipboard write is issued before any `await`, because Safari drops the click's permission across one. Browsers without `ClipboardItem` image support (Firefox) get a PNG download instead.
