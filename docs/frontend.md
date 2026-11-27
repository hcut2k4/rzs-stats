# Frontend

## Frontend Pages

Routes: `/` Home, `/teams`, `/teams/:abbr`, `/standings`, `/efficiency`, `/games`, `/elo`, `/qb`, `/about`, `/changelog`, `/admin`. The `RZS Stats` wordmark links to `/`. `/trends` no longer has a page — it redirects to `/standings?tab=history`, so old links and bookmarks keep working.

### HomePage
Landing page at `/`. Leads with **Best Games Ahead** — the five closest unplayed games league-wide, ranked by the favorite's win probability (closest to a coin flip first, week ascending as tiebreak), linking to `/elo?tab=games`. Below it, one preview card per section (Standings, Efficiency, Games, Elo, QBs, Trends, About) in a 3-column grid; each card is a `Link` to its page. The Trends card has no page of its own — it links to `/standings?tab=weekly`. Every section fetches independently so one failed request doesn't blank the page — top 5 by PyPAT, latest week's scores, top 5 Elo with biggest riser, top 5 QBs by TANY/A, and a mini PyPAT line chart for the top 4 teams.

The Best Games table mirrors the Elo **Projected** table — same columns, `LeanBar`, Outlook tiers and shading — by importing the same helpers rather than restating them. **The tier thresholds, colors and `lean()` live only in [utils/eloLean.js](../frontend/src/utils/eloLean.js)**; change them there and both tables move together.

### TeamsPage and TeamPage
`/teams` lists every team by division from the latest standings: a team-color edge, record, PyPAT, Elo rank and a last-five results strip (form and Elo rank come from `/elo/games?season=` and `/elo/ratings?season=`; the index still renders if either fails). `/teams/:abbr` is the profile: the abbreviation is case-insensitive, and `?season=` holds the **league season number** (e.g. `105`), omitted for the latest season. `TeamCell` links every team name in every table to it, and links inside a profile keep the selected season.

The profile is built entirely from existing league-wide endpoints, filtered to the team client-side: `/standings`, `/efficiency?stage=regular`, `/qb/leaderboard` (season, regular, unqualified included), `/elo/upcoming`, `/elo/games?teamId=` (all seasons, once per team), `/trends/season` and `/elo/history` (all seasons). Every request goes through `useLoad` ([utils/useLoad.js](../frontend/src/utils/useLoad.js)): it only hands data back for the key it was fetched for, so a response for a season or team the user has left never renders, and it reuses a response for five minutes, so switching seasons or opening another team does not refetch the all-time payloads. Tests call `clearLoadCache()` in `beforeEach`. Each section shows its own loading and empty states; failed sources are named in a banner while the rest still render. Pure derivations live in [utils/teamProfile.js](../frontend/src/utils/teamProfile.js) (percentiles and ranks, the fingerprint rows, the team-side game view, Elo expected wins, projected record, head-to-head, franchise rows, and small classifiers such as `luckLean` and `quadrant`) so a later "standout" layer can reuse them; export specs are built in [components/team/specs.js](../frontend/src/components/team/specs.js).

Profile copy is shared between screen and PNG panels through `utils/teamProfileCopy.js`: summaries use team nicknames and branch on quadrant, luck, season status and singular/plural counts. Outlook tooltips generate probability ranges from `TIERS` in `utils/eloLean.js`. Prose uses “win probability” and scope notes use “Regular season only.” The header labels games-played SoS **Strength of Schedule**, uses **Neutral luck** near expectation, and displays **Little change vs S104** for minor deltas (the title retains the exact change). Road Ahead labels are **Projected record**, **Favored in**, **Remaining SoS**, and **Win probability**. Rivalries uses **GP**, **Point Diff**, and **Pts/G For–Against** on screen and in exports.

Layout, top to bottom: breadcrumb and **Masthead** (team-color wash, KPI strip with league ranks; season-over-season deltas under 1 PyPAT point or 15 Elo are muted), a sticky section bar, **Team Fingerprint** (offense and defense percentile sliders, flipped so right is always better) beside **League Landscape** (offense/defense Pts/Drive scatter, this team ringed, quadrants at the league average like the Efficiency page), **Truth Behind the Scoreboard** (actual vs PyPAT vs Elo expected wins plus the week-by-week gap, regular season) beside **Road Ahead** (only while games remain; projected record rounds the summed win probabilities and keeps ties; Outlook reads the Elo tiers from this team's side, e.g. "Likely loss"), **Season Arc** (game tiles, a swipe strip on phones; upset wins shaded good, upset losses bad; Elo after every game including playoffs), **QB Room**, **Franchise History** (Elo line with peak and low, seasons newest first) and **Rivalries** (top 10 by the current sort, expandable; the export follows what is shown).

SoS follows the About contract for Played, Left and Total: Previous-season opponent quality through Week 9; current-season quality from Week 10 through the playoffs. Finished seasons use their own season. The toggle overrides the default. Season index 0 uses current-season quality. The current week is the latest completed regular-season week index from `getAvailableWeeks(season, 1)`, shared through the `useLoad` cache. Regular-season weeks remain available through the playoffs and offseason. Loading or empty weeks keep the early-season default. There is no per-team fallback, so every team is ranked on the same variant. Team color comes from `primaryColor`, a decimal RGB string from NeonSportz; `teamColorVars` sets `--team`/`--team-dark` and `.team-scope` in `index.css` resolves `--team-c`, lifting very dark colors only on the dark theme.

Shared pieces pulled out for this page: efficiency `METRICS` and the scatter helpers (`tierPoints`, `leaguePointsPerDrive`, `halfPointScale`) in `utils/efficiencyMetrics.js`, `QuadrantLabel` in `components/`, `upsetInfo` in `utils/eloLean.js`, `weekName`/`shortWeekName` in `utils/playoffRounds.js`, and QB formatters, tooltips and `neonPlayerUrl` in `utils/qb.js`.

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
Passcode gate driven by `GET /api/admin/auth`. A live status card leads the Sync, Maintenance, Repairs & backfills, and Elo model sections in a `max-w-3xl` layout. One `GET /api/admin/status` poll refreshes pipeline, player/team sync, cache warming and sync settings every 2s while active, every 10s idle, and immediately on focus or returning to a visible tab; hidden tabs pause polling. Status requests have an 8s deadline and are aborted on unmount; failures show Disconnected and updates older than 20s show Stale until a successful poll. Any admin 401 clears the stored token and reopens the existing passcode gate. Actions keep fast polling for at least six seconds to catch delayed starts. The card uses pipeline operation identity, elapsed time, outcome and completion time for the last run, with QB/warm phases supplying only progress messages; locked actions explain which operation is running, and failures show backend messages. Auto-sync has interval presets and a custom minutes input. Full re-sync and all-season player/team repairs require inline confirmation; repairs and probability backfills have season selectors. Elo Save is enabled only for changes while the pipeline is idle, with default hints and Reset to defaults; save responses refresh settings state. Nightly full reconciliation runs at 4am ET.

### AboutPage
Card grids for stat definitions (PyPAT, Luck, SoS, Elo, TANY/A, RUSH+) and per-page descriptions. Data sync banner. Resource links (videos, blog posts, external references). **Adding a stat or a page means adding it here too** — this page is the user-facing contract for what every number means.

### ChangelogPage
Dated updates at `/changelog`, linked near the top of About. Feature jump anchors and linked screenshots accompany the release copy. The Elo tier scale and upset ladder use the shared definitions in `utils/eloLean.js`.

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
  cols: [{ label, group, desc, text, value, z, color, align, keepText, logo, bar, image, imageHidden }],
  api: { path, params, fields, note } }
```

- **Build it from the page's own state**: `rows` is exactly what is on screen (filtered, sorted, preset-reduced) and `qualifier` describes that slice, so never reuse a header phrase that stops being true after a re-sort.
- **Pages with a `COLS` array** call `specCols(COLS, cellColor)`. A column whose `fmt` returns JSX **must declare `tx`**, the plain-text version; a `tx` column with no `value` is text-only. `exportLabel` replaces `label` in the CSV/AI header where the on-screen header leans on a group band (`SoS Played`, not `Played`). **Pages without one** (all of EloPage) declare an export-only spec beside the table instead of refactoring the table to render from it.
- **Missing is decided from `value()` before formatting**, never recovered from text: on-screen formatters render null as an em-dash, which must not reach a CSV. A null, undefined or NaN value is an empty cell; zero-denominator rates need an explicit `value` returning null so they are empty, not 0. `keepText` is for text that carries meaning, such as `n/a` for TD:INT.
- **Excel gets a typed number only when a column has both `value` and `z`** (a SheetJS format such as `0.0%`); a bare number would show `0.681` where the site shows `68.1%`. Without `z` the cell is the text.
- **Every column needs a `desc`**: the AI export prints it as the column definition. Reuse the tooltip / `TIPS` / `METRICS` text rather than writing a second copy.
- **`api.params` must come from the same response as `rows`.** Store the resolved params with the rows when a response lands and guard against out-of-order responses (see StandingsPage); never read them from live UI state. `preset`, sort and other client-only state go in `api.note`, not in params.

### CSV safety and the image shape
Excel runs a cell that starts with `=`, `+`, `-` or `@` as a formula, so the **downloaded CSV** prefixes such text cells with `'` (plain signed numbers like `-20` and `+0.4` are left alone). The AI text and the XLSX stay raw: the AI block is not opened in a spreadsheet, and an XLSX stores names as text cells.

A spec may carry an `image: { width, draw }` panel for PNGs. Width defaults to 900 CSS pixels; the team header overrides it to 390. The asynchronous `draw(ctx, width)` layout returns `{ height, draw(ctx) }`; the second draw renders the content inside the shared light-theme frame. PNG routing prefers `image`, then `imageSpec`, then the table. CSV, XLSX and AI always use the original rows and columns.

A spec may carry an optional `imageSpec`, used **only by the PNG button**, for data whose tidy long-form shape is too tall to draw. QB rank history is one row per player per week (over 1,000 rows all-time), so its CSV/XLSX/AI keep that shape while its image is a player-by-week grid of ranks.

### The AI export
A markdown block meant to be pasted into an AI chat: a league primer, what the table is, one definition per column, the full dataset as a fenced CSV, then the public REST API: the exact `GET` URL that produced the table, how each derived column maps to the raw API fields, a list of related endpoints, and the conventions an assistant gets wrong without being told. The base URL is `window.location.origin`, so a dev build emits `localhost`. The API is unauthenticated, so an assistant can re-fetch fresh data itself.

The conventions text (`CONVENTIONS` in `exportTable.js`) was checked against the backend and must be re-checked when an endpoint changes. The easy mistakes: `/api/games` takes a **numeric** `stage` (`2` = playoffs), while `/api/qb/*` and `/api/efficiency` take a **named** one (`regular|playoffs|both`; a number is a 400); `season` is a 0-based index and `/api/games` also requires `week`.

### The image export
`tableImage.js` draws the table on a canvas rather than capturing the DOM, so sticky columns, horizontal scroll and cross-origin logos cannot clip or taint it. It is always light-themed (heat colors are low-alpha tints that composite over white) and loads optional column `logo(row, i)` abbreviations through a shared session cache using anonymous CORS and a 3-second timeout. Failed logos leave text without a gap. Optional `bar(row, i)` returns `{ value, max, color, text }` for centered diverging bars; `text: false` hides the number. Lean bars share the screen’s colors and scaling. Columns with `value` align right by default; other columns align left. `align` overrides both headers and cells. PNG-only `image` column overrides and `imageHidden` retain data-only fields in CSV/XLSX/AI. Missing cells render as an em dash. Long qualifiers wrap above the table, and group bands reserve enough width for their headings. Size is checked on width, height and area before the canvas is allocated: it tries 2x, then 1x, then reports `Too big` (iOS Safari's ~16.7M px canvas is the binding limit). Drawing is asynchronous to preload logos; the clipboard receives a blob promise synchronously before any `await`, because Safari drops the click's permission across one. Browsers without `ClipboardItem` image support (Firefox) get a PNG download instead.

Chart PNGs are canvas-drawn, with team logos when CORS allows and abbreviations otherwise.

Table PNGs also support `meter(row, i)` (0–100 percentile), `chance(row, i)` (0–1 probability), `pill(row, i)` (outlined text), and `form(row, i)` (W/L/T results). Null meters and chances leave an em dash. Optional `tiles: [{ label, value, note }]` appear above the table; `rowMuted(row, i)` mutes unqualified rows. `layoutTable(spec, ctx)` returns `{ width, height, draw(ctx, x, y) }` for embedding a content-fit table in a panel. `IMAGE` holds the light palette; `imageFrame` supplies the title, wrapped qualifier, host/date footer and size guard for tables, charts and panels. Chart exports accept an optional focus team id and focus color; without a focus, Efficiency chart rendering stays the same.
