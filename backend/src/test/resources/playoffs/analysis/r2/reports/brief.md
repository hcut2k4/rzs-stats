# Shared brief: Madden NFL 27 playoff seeding, research round 2

## Background
Madden NFL 27 franchise mode seeds 7 teams per conference: 4 division winners as seeds 1-4, 3 wild cards as 5-7. Its seeds often differ from the official NFL tiebreakers. The working assumption is that the developers tried to implement the NFL procedure and made a small number of ordinary programming mistakes: a reused function, a reversed comparator, wrong processing order, wrong data field, or stale data. Challenge that assumption if the evidence warrants it.

The goal is the most parsimonious *plausible implementation*: pseudocode plus a list of specific coding defects that explains the observed seeds. Fitting the data is necessary but not sufficient.
- Prefer fewer, more natural defects, even at the cost of one or two mismatches.
- Investigate a mismatch before adding a special case.
- Never claim Madden's internal algorithm is identified just because outputs match.

## Data (read-only: never modify anything under /home/honeycke/code/rzs-stats)
Paths are relative to /home/honeycke/code/rzs-stats/backend/src/test/resources/playoffs/.

### `analysis/dataset.json`
A list of 17 seasons from 9 leagues, all Madden 27. Each season has:
- `id`
- `teams`: {abbr: {conf, div, id}}
- `games`: [[weekIndex, home, away, homeScore, awayScore]]
- `seeds`: {AFC: [candidate seed orders], NFC: [...]}

Details:
- Every team plays 17 games.
- weekIndex runs 0..17. weekIndex 17 is the final week ("Week 18"), and every team plays in it.
- Seasons whose id ends in -2026 use the real NFL schedule, so all their final-week games are divisional. The 2027 seasons and SIMFULL have generated schedules.
- A tie game counts as half a win; there is one tie in the data.

### Ground truth
- A model's 7 seeds must equal one of the candidates.
- There is exactly one candidate everywhere except MSS-2027, which has 2.
- RZS-2026, RZS-2027 and SIMFULL come from in-game bracket screenshots.
- The other 28 conferences are inferred from actual playoff games:
  - #1 has the bye.
  - In the wild-card round, 2v7, 3v6 and 4v5, with the higher seed hosting.
  - In the divisional round, #1 hosts the lowest remaining seed.
  - The higher seed hosts in later rounds.
- The inference also assumes that a better win% never gets a worse seed, within division winners and within wild cards.
- Only actual playoff matchups are ground truth. Ignore any mid-season standings "seed" values.

### Held-out partial season
`sim2026-partial.json`; see `analysis/heldout26.py` for loading. Only 8 NFC teams have full schedules, so only 3 tie groups are testable:
- NFC North title {GB, DET, CHI}: GB.
- Division-winner seeds 2-4 {ATL, LAR, GB}: ATL, LAR, GB.
- Wild cards 6-7 from {DET, PHI, CHI}: DET 6th, PHI 7th, CHI out.

Some metrics depend on teams without full schedules and may be incomplete. Flag any result that relies on them.

### Python harness (run from `analysis/`)
- `sim.py`: class `Lg` (records, head-to-head, division/conference records, common games, SOV/SOS, net points) and class `Model`. Its NFL config scores 19/34.
- `decisions.py`: `ALL` = every tie decision implied by the seeds. ctx 'div' = division title, 'dw' = division-winner seeding, 'wc' = wild card.
- `multi.py`: `MULTI` = the 3+-team decisions.

### Other references
- Java NFL engine, validated on every real NFL seed 2002-2025: /home/honeycke/code/rzs-stats/backend/src/main/java/com/rzs/stats/playoffs/ (`PlayoffSeeding.java`, `TiebreakerRules.java`).
- Real NFL data: /home/honeycke/code/rzs-stats/backend/src/test/resources/nfl/games.csv and standings.csv.
- Madden's internal team index, alphabetical by nickname, for sort-order and stability hypotheses (index 0..31): SF CHI CIN BUF DEN CLE TB AZ LAC KC IND WAS DAL MIA PHI ATL NYG JAX NYJ DET GB CAR NE LV LAR BAL NO SEA PIT HOU TEN MIN

## Official NFL procedure (summary)
**Division ties, 2 clubs:** H2H, division record, common games, conference record, SOV, SOS, combined rankings (conference, all), net points in common games, net points in all games, net TDs, coin toss.

**Division ties, 3+ clubs:** the same steps, with H2H = win% in games among the tied clubs. When a club is eliminated or advanced, the remaining clubs restart at step 1, in 2-club format if two remain.

**Wild card:**
1. Reduce the tie to the highest-ranked club in each division, using division standing / division tiebreakers.
2. With 2 clubs: H2H, conference record, common games (minimum 4), SOV, SOS, ...
3. With 3+ clubs: the H2H sweep only (a club that beat each of the others advances; a club that lost to each of the others is eliminated), then conference record, common games (minimum 4), SOV, SOS, ...
4. After each club is selected, restart, re-reducing per division.

**Division winners** are seeded 1-4 by record, with ties broken by the wild-card procedure.

## Rules for every workstream
- Write only under your own output directory, given in your prompt. Scripts must be re-runnable with python3 and print their results.
- Report what you tested, with exact scores (x/34 conferences, y/3 held-out). Say which cases fail and why, and give an honest confidence assessment.
- Distinguish in-sample fit from genuinely held-out prediction.
- Put details in report.md in your directory. Keep the final handoff message under ~800 words.
