# Madden playoff tiebreakers

Status as of 2026-11-21 (research round 3). Session handoff and current conclusions: [madden-playoff-handoff.md](madden-playoff-handoff.md). Goal: predict the playoff field Madden 27 actually produces. It differs from the real NFL rules when several teams tie.

## Round 3: the plain-rules model (start here)

The user asked for a simpler explanation and supplied a Reddit case from Madden 26: a forced replay of the real 2025 season. The real 2025 schedule is in `nfl/`, and the Madden 26 result is the fixture `playoffs/analysis/r3/madden26_2025.json`.

**The case.** ATL, TB and CAR all finished 8-9 in the 2025 NFC South. The NFL gave the division to CAR, the best head-to-head team among the three: CAR swept ATL and split with TB. Madden gave it to TB on every run.

**M3 and M4 both get this wrong.** They predict ATL, so the first new data point refuted their untested extrapolation to 3+-team division titles. The full-season Madden 27 data contains no such tie.

The four plain rules (`r3/plain_model.py`):

1. **Two tied teams, in any situation:** the NFL division-race checklist. Head-to-head first, then division record, common games, conference record, and so on. This holds even for wild cards and seeding, where the NFL uses a different list.
2. **Three or more teams tied for a division title:** Madden removes the team that is worst on the first checklist item that separates them, then starts over with the rest. The NFL instead takes the team that is best on that item.
   - In the 2025 South, ATL (1-3 head-to-head) drops out.
   - CAR vs TB then restarts as a two-team tie. Head-to-head is 1-1 and division records are equal.
   - Common games decide it: TB 6-6 vs CAR 5-7.
3. **Three or more teams tied for a seed or wild card:**
   - a. If exactly one team beat none of the other tied teams (including teams it never played), it goes last.
   - b. Otherwise, rank by head-to-head record against the other tied teams **backwards**: the worst record gets the best spot. A team with no games against them counts as .500. Ties within that ranking restart.
4. **Wild cards:** decide who gets in first, then seed the qualifiers against each other.

**Fit.** It matches 34 of 36 conferences (32/34 Madden 27 plus both Madden 26 conferences) and 3/3 partial-sim groups. For comparison, the NFL rules match 20/36.
- Both misses involve same-division teams competing for wild cards: DM2-2027 NFC and SFL-2026 AFC.
- M4's extra pieces fix them, but each piece rests on one case:
  - a one-team-per-division step with backwards head-to-head, placed after rule 3a
  - a stale common-games set
- With those pieces plus rule 2, everything fits (36/36). That is a fitted result, not a confirmed mechanism.

**Ruled out this round:**
- Points allowed as a tiebreaker (old forum claims). It agrees with Madden in 26 of 52 two-team decisions and disagrees in the other 26.
- A swapped AFC/NFC "conference record" column, globally or only in multi-team ties: at most 30/36.
- Any model with normal or skipped head-to-head in 3+-team ties: at most 30/36.
- Seeding the whole conference as one tie group.

The backwards head-to-head in rule 3 is directly visible in the screenshot data:
- **SIMFULL AFC:** DEN got the #1 seed (screenshot re-audited 2026-11-21; an earlier transcription had NE #1): DEN played neither NE nor IND, NE lost to IND yet took #2, IND took #3.
- **Season 103 NFC:** Madden took CHI and LAR, both swept by their division rivals.

**"It worked before 18 weeks / 7 teams?"** Not supported.
- Forum threads complain about wrong tiebreakers in Madden 18 and Madden 20, which used the 6-team format.
- Every stale-final-week test failed (round 2).

**Production still runs M3.** By user instruction it was not changed.

## Ground truth

Madden uses the same game results we store.

| Season | Source | AFC seeds 1-7 | NFC seeds 1-7 |
|---|---|---|---|
| 103 (league) | screenshot; `playoffs/rzs-seasons.json` key `103` | BUF JAX DEN BAL HOU CIN IND | TB SF GB WAS NYG CHI LAR |
| 104 (league) | screenshot; key `104` | BUF IND CLE KC HOU LV PIT | ATL NYG CHI SF NO PHI DET |
| Sim, full season | screenshot; `playoffs/sim-full-season.json` | DEN NE IND PIT LAC BUF LV | SEA DET PHI ATL LAR SF WAS |
| Sim 2026, partial (8 NFC schedules) | screenshot; `playoffs/sim2026-partial.json` | BAL LAC BUF HOU CIN NE KC | NYG ATL LAR GB DAL DET PHI |

- **Other leagues.** 14 more seasons come from 8 other Madden 27 NeonSportz leagues (UFL, SML, DM2, SMLP, SFL, ALS27, MSS, MMGA6); fixtures are in `playoffs/neon/`. All 9 leagues are Madden 27: season 0 = calendar 2026.
- **Inferring seeds from brackets.** Seeds come from the actual playoff games:
  - #1 has the bye.
  - Wild-card games are 2v7, 3v6 and 4v5, with the higher seed hosting.
  - #1 hosts the lowest remaining seed in the divisional round.
  - The higher seed hosts later games.
  - Assumption: a better record never gets a worse seed, within division winners and within wild cards.
- **Inference check.** This reproduced every screenshot it could check. It is unique in 26 conferences; MSS-2027 has 2 candidates per conference.
- **Ground-truth policy (user decision).** Only actual playoff matchups count. Mid-season standings `seed` values are ignored.
- **Dataset.** Everything is in `playoffs/analysis/dataset.json`: 17 seasons and 34 conferences. Stored scores are authoritative over Neon forced-win flags; ALS27's live standings follow the scores.

All paths are under `backend/src/test/resources/`.

## Code

**Production package:** `backend/src/main/java/com/rzs/stats/playoffs/`.
- `PlayoffSeeding` + `TiebreakerRules.nfl()` implement the official NFL procedure. They reproduce every real NFL seed and division rank, 2002-2025. The oracle is `nfl/` (nflverse); its SOV/SOS convention differs in 2002, 2008, 2012, 2014, 2018, 2019 and 2022, which are excluded.
- `MaddenSeeding` / `PlayoffSeeding.seedMadden` implement **M3**.

**Tests:** `NflSeedingHistoryTest`, `PlayoffSeedingTest`, `RzsMaddenSeedingTest` and `MaddenModelTest`. `MaddenModelTest` checks M3 at 34/34 and the 3 partial-2026 groups, and NFL at 19/34. Run with `cd backend && ./mvnw test -Dtest='*Playoff*,*Nfl*,*Rzs*,*Madden*'`.

**Research harness (Python):**
- `playoffs/analysis/`: `sim.py` holds metrics and the original model grid; `divwc.py` is the M3 reference.
- `playoffs/analysis/r2/`, run with `python3 <script>` from any directory:
  - `m4.py`: clean engine; every defect is a flag, and the defaults are M4.
  - `m4_family.py`, then `m4_cv.py`: the 21,504-model defect family and cross-validation.
  - `predict.py <season.json>`: NFL, M3 and M4 seeds for a season, flagging disagreements.
  - `sim_disagree.py <seed> <n>`: random seasons on real schedules; counts model disagreements.
  - `reports/`: the Codex workstream reports from round 2. The scripts they cite lived in a session scratchpad and are not preserved.

## M4: leading implementation-level explanation (34/34, 3/3)

An attempt at the NFL procedure, with one shared tiebreak routine for every context and a handful of ordinary bugs:

```
breakTie(teams, ctx)                        # ctx: division title | division-winner seeding | wild card
  commonOpps = commonOpponents(teams)       # D4: computed once, never recomputed after a team drops out
  return resolve(teams, ctx)

resolve(teams, ctx)
  if |teams| == 2: return twoClub(teams)    # D1: NFL DIVISION list everywhere: H2H, div, common, conf, SOV, SOS, net
  # NFL "head-to-head sweep": eliminate a club that lost to each of the others
  swept = [t in teams : t won none of its games against the other tied teams]
                                            # D2: loops over games played, so unplayed opponents and
                                            #     zero-game clubs pass; fires only if exactly one club qualifies
  if |swept| == 1: return resolve(teams - swept, ctx) + swept
  if ctx == wild card and some division has 2+ teams:   # P: NFL does this FIRST; Madden does it after the sweep check
      leaders = per division: first of sortByGroupH2H(clubs), then div, common, conf
      return resolve(leaders, ctx) + resolve(rest, ctx)
  tiers = group teams by H2H win% against the tied group, ASCENDING, no games = .500
                                            # D3: missing reverse() or opponent-perspective record; same helper as above
  if more than one tier: return concat(resolve(tier, ctx) for tier in tiers)
  then division, common (commonOpps), conference, SOV, SOS, net points: split into tiers, resolve each

seeding
  division winner = best record; ties via breakTie(..., division title)
  seeds 1-4: division winners by record; ties via breakTie(..., seeding)
  wild cards: walk record groups; at the cutoff group pick the top k with breakTie,
              then run breakTie again on just the chosen teams to seed them     # qualify, then seed
```

**What each piece explains:**

| Piece | Kind | What it explains |
|---|---|---|
| D1 two-club ties always use the division list | Reused function | Division record beating conference record in wild-card and seeding ties |
| D3 group H2H sorted ascending, in a helper shared by the multi-team step and the division reduction | One reversed sort | Inverted H2H in both places. The dedicated two-club comparator is a separate function and stays correct. |
| No sweep-winner branch | Design: the H2H% sort was presumably meant to put a sweeper first | With D3, a team that beat every other tied team ranks last |
| D2 "lost to each" coded as "no wins" | Loop bug | Eliminates the loser before reduction. This removes M3's SFL "division already has a wild card" exception **and** M3's special post-reduction wild-card list (SIMFULL NFC). |
| P reduction after the sweep check | Ordering | Needed together with D2 (SIMFULL NFC, SFL) |
| D4 stale common-opponent set | Cached value | DM2-2027 NFC, which D2 would otherwise break. In DM2 the original group's only common opponent is CAR, so it falls through to conference record. |
| Tiered sort, qualify-then-seed | Ordinary sort-based structure | Tier splits; SIMFULL AFC seed order |

**Defect count.**
- My grouping: 5 bugs (D1, D2, D3, D4, P) plus 3 design choices (one shared routine with no sweep-winner check, tiers, qualify-then-seed).
- Codex A's strict site count: M4 = 12, or 11 if the reduction already called the shared helper. Compare M3 = 13 and its cache model = 12/11.
- M4 is not much smaller by raw count. Its advantage is that every part is an ordinary coding pattern; nothing is a hand-written special case.

**Cumulative build-up from NFL, each step adding one change:**

| Change | Score |
|---|---:|
| NFL rules | 19 |
| + D1 | 23 |
| + D3 | 25 |
| + no sweep-winner branch | 27 |
| + reduction through the inverted helper | 30 |
| + D2 | 30 |
| + P | 32 |
| + qualify-then-seed | 33 |
| + D4 | 34 |

The "two ordinary mistakes" theory (reused list plus reversed comparator) explains 25/34. No implementation with at most 4 changed sites exceeds 26/34 (Codex A, exhaustive within its grammar).

**Independent check.** Codex A reimplemented M4 from the written spec without seeing the code and also got 34/34 and 3/3. A one-change search around the vacuous check found exactly two fixes for DM2:
- D4
- inner same-division pairs ordered H2H, DIV, CONF, COM

Both fit; D4 is the more natural defect.

## Ranked candidate implementations

| Rank | Implementation | Fit | Partial 2026 | Notes |
|---|---|---|---|---|
| 1 | **M4** | 34/34 | 3/3 | All parts ordinary bugs. D4, qualify-then-seed and the reduction each rest on one conference. |
| 2 | **M3** (production) | 34/34 | 3/3 | Needs an explicit "division already has a selected wild card → normal H2H" check, a post-reduction wild-card list, and conference before common games in the reduction. |
| 3 | A-cache (Codex A) | 34/34 | 3/3 | A lazy per-division standings cache creates the SFL behavior. Constructed after seeing SFL; the cache's lifecycle is speculative. |
| 4 | Any-loss vacuous check (Codex C) | 34/34 | 3/3 | Its check: lost at least once to every opponent it played. Still needs M3's post-reduction wild-card list and conference before common games. |
| 5 | B-shared (Codex A) | 33/34 (misses SFL) | 3/3 | 11 sites. |
| 6 | Raw-loss bottom elimination (Codex A) | 32/34 | 3/3 | 9-10 sites. |
| — | Official NFL rules | 19/34 | 2/3 | |

The partial-2026 groups were consulted while building every model above. Treat their 3/3 as a diagnostic, not a blind result.

## How much the data actually proves

How many of the 34 conferences break when one M4 piece is switched to its alternative:

| Component (alternative) | Conferences needing it | Leagues | Witnesses if few |
|---|---:|---:|---|
| Two-club division list (NFL list by context) | 12 | 9 | |
| Two-club DIV before CONF | 11 | 8 | Only 5 direct conflicts survive an H2H tie |
| Group H2H ascending (descending) | 8 | 7 | |
| No sweep-winner advance (NFL advance) | 4 | 4 | UFL-2026 AFC, SML-2026 NFC, DM2-2027 NFC, MSS-2027 AFC |
| Sweep-loser check exists (none) | 4 | 4 | SIMFULL NFC, UFL-2027 AFC, SML-2026 AFC, SFL-2026 AFC; also 0/3 partial |
| Inverted reduction (normal H2H) | 4 | 3 | RZS-2026 NFC, RZS-2027 NFC, UFL-2026 AFC, SFL-2026 AFC |
| Loser check unique (all no-win teams go last) | 10 | 7 | |
| Zero-game clubs count as "no wins" (need ≥1 game) | 7 | 4 | |
| D2 vacuous (strict) | 2 | 2 | SIMFULL NFC, SFL-2026 AFC |
| Reduction after the check (NFL first) | 2 | 2 | SIMFULL NFC, SFL-2026 AFC |
| Two-club COM before CONF | 1 | 1 | UFL-2026 NFC, a division title; cross-division order is extrapolation |
| No-games H2H = .500 (0 or 1) | 1 each | 1 | SIMFULL AFC, MMGA6-2027 AFC; any value strictly between 0 and 1 fits |
| Reduction exists (none) | 1 | 1 | SFL-2026 AFC |
| D4 stale common set (recomputed) | 1 | 1 | DM2-2027 NFC |
| Qualify-then-seed (take k) | 1 | 1 | SIMFULL AFC |

Exercise counts (Codex C):
- Of 52 two-team decisions, 21 stop at H2H, 23 at division record, 5 at common games and 3 at conference record. None reaches SOV, SOS or net points.
- Inverted multi-team H2H decides 10 decisions across 7 leagues.
- No 3+-team tie ever reaches the steps after H2H, so that fallback order is **untested**.
- No full season has a 3+-team division-title tie.

## Cross-validation (model chosen only on the training folds)

| Family | Leave one season out | Leave one league out | Misses |
|---|---|---|---|
| M4 family (21,504 models; max training fit, then fewest NFL deviations) | 30/34 | 30/34 (10 folds incl. SIMFULL) | SIMFULL AFC, UFL-2026 NFC, DM2-2027 NFC, SFL-2026 AFC |
| M3 family (5.3M models; Codex C, weighted NFL distance) | 32/34 | 30/32 (9 named leagues) | DM2-2027 NFC, SFL-2026 AFC |
| Official NFL rules | 19/34 | | |

- Every miss is a fold that held out the **only** evidence for one component. The shared structure (D1, D3, the sweep-loser check, tiers) predicts held-out seasons; the single-witness pieces cannot be predicted until they are seen.
- Only 2 of the 21,504 M4-family models fit 34/34, and 693 of Codex C's 5.3M do.
- Best fit by number of NFL deviations rises smoothly, 19, 23, 26, 27, 30, 31, 32, 33, 34, with no sharp elbow.
- These are fold-refitted results over families designed after seeing the data, not blind predictions.
- **The only genuinely blind test (Codex D).** D froze its candidates without ever seeing M3 or M4, then scored them on partial 2026.
  - It found the same core on its own: the reused division list and reversed multi-team H2H.
  - It missed the sweep-loser elimination. Its best fit, 28/34, scored **0/3** on the held-out groups; it makes CHI the NFC North champion after CHI went 0-4 against GB and DET.
  - This independently supports the elimination step that M3 and M4 share. See `r2/reports/D_blind_summary.md`.

## Week 17 vs Week 18 (Codex B)

Verdict: **no evidence that stale Week-17 inputs drive seeding.**

- 17 of the 20 decisions where NFL rules mispredict had every head-to-head game among the tied teams finished before the final week.
- 12 of the 14 inverted comparisons are unchanged with the final week removed.
- Across 128 stale-field combinations, 7 base procedures and cutoffs ≤15/≤16/≤17 (2,688 configurations), nothing replaced the inversions or fixed SFL without M3's exception.
- A stale Week-17 division order does explain two pairs, because the kept team led after Week 17 and lost the series in Week 18: PHI over WAS (RZS-2027) and CIN over CLE (UFL-2026). It fails RZS-2026 NFC and SFL, where the sweep was finished well before Week 18.
- Stale common-games and SOV/SOS values change no observed outcome, so their freshness can't be certified either way.
- Anomalies are mildly enriched among decisions whose inputs changed in Week 18 (Fisher p≈0.03 for standings order). Substitution doesn't improve any fit, though, and the decisions are correlated.
- Clinch flags were not used. They likely come from a separate subsystem.

## Not identified

- **Inverted win% vs ascending net W-L vs opponent-perspective record.**
  - The opponent-perspective record is algebraically identical to inverted win%.
  - Net W-L differs only with unequal meeting counts. It never differed in 3,000 simulated conferences.
- **The exact no-games value.** Anything strictly between 0 and 1.
- **The vacuous check's exact form.** "No wins" (M4) vs "a loss to every opponent played" (Codex C). They need different companion rules.
- **D4 vs a pair-specific conference-before-common order** (DM2 only).
- **Order of steps after group H2H** (never reached); SOV, SOS and later steps (never decisive).
- **3+-team division-title ties without a sweep.**
- **Common vs conference record in cross-division two-team ties.**

## Next season: how to test

1. Before looking at the bracket, run `python3 backend/src/test/resources/playoffs/analysis/r2/predict.py <season.json>` and record each model's seeds.
2. M3 and M4 disagree in ~13% of random conferences (`sim_disagree.py`). The main source is a **chain**:
   - three wild-card teams from three divisions
   - C beat B, B beat A, and A and C never met
   - M4 drops A (no wins) and takes C, where M3 takes A
   
   The chain also separates M4 from A-cache.
3. Other targeted shapes, with fixtures in Codex A/C reports:
   - SFL-shaped five-team tie with a prior North wild card. A-cache and M4 take KC/BAL, B-shared BUF/PIT, C KC/PIT.
   - DM2-shaped tie where H2H and division record are level, conference record favors one team and common games the other. This separates D4 from the pair-specific order.
   - Any 3+-team tie with H2H% level, to finally reach the fallback order.

## Ruled out

- Week-to-week stable-sort history.
- Week-17 stale inputs: see above.
- Comparator-plus-sort models: best 24-26/34.
- Excluding forced wins from tiebreakers: 32/34.
- Home/road record steps.
- Venue-based H2H bugs.
- Clinch locking.
- Pairwise reduction lists of up to 4 steps.
- A sweep winner advancing, as NFL does: 4 conferences contradict it.
- A non-unique "no wins" rule.
- Requiring a game before a team counts as "no wins".

## History

- **M2.** Fitted to 103/104 and the full sim. It failed on the other leagues (19/28), then was replaced.
- **M3.** Found by searching rule variants against all 34 conferences. Implemented in Java.
- **Round 2 (this document).** Asked whether ordinary coding defects explain M3's odd parts. That produced M4, plus independent audits:
  - Codex A: defect-space search and blind reimplementation of M4.
  - Codex B: Week 17.
  - Codex C: exercise counts, cross-validation and equivalence classes.
  - Codex D: blind rebuild without seeing M3; best 28/34, 0/3 blind held-out.
