# Handoff: resetting Elo when a team changes owners

Pick-up document for a new session. Goal: work out when and how to reset or regress a team's Elo when its human owner changes, and test whether doing so improves rating accuracy on both Madden 26 and Madden 27. Nothing here has been built.

## The idea

Elo currently treats a franchise as the same entity across seasons. What persists in this league is the *person*, not the franchise. When ownership changes, last season's rating says little about the new owner, so the team should regress harder (possibly to 1500). A returning owner's older rating may be the better starting point. We expect this is part of why the data wanted low offseason retention in early testing.

Status: tabled earlier at the user's request ("it will take additional development"). The user can supply ownership changes by hand; the current cycle is easy, the previous one may be harder.

## Where things stand (all merged to master, `aad89dd`)

**Chosen defaults:** K 25, divisor 400, MOV on with cap 28, offseason retention 0.78, home field 0, no K boost. The saved production config row overrides code defaults, so production runs these only after the Admin Elo editor is saved (Reset to defaults, then save). Check whether that has been done before comparing to live numbers.

**Baseline to beat (all 2,572 games, log loss, lower is better):** 0.594828. Old defaults (retention 0.90, cap 21): 0.597657.

**Baseline per season (committed settings, log loss):**

| Season | LL | | Season | LL |
|---|---:|---|---|---:|
| 96 | 0.6177 | | 101 | 0.5854 |
| 97 | 0.6072 | | 102 | 0.6278 |
| 98 | 0.5619 | | 103 | 0.6205 |
| 99 | 0.5933 | | 104 | 0.5735 |
| 100 | 0.5319 | | 105 | 0.6894 (98 games so far) |

**What the data said about retention:** flat from 0.67 to 0.80 (within 0.0005 LL), 0.90 costs 0.0024. The user's 0.75 minimum is a constraint they set from 105 seasons of observation. A single league-wide retention number is probably averaging over franchises whose owner stayed (sticky) and franchises whose owner changed (not sticky). Owner-aware regression is the natural fix, and the testing below should say how much it helps.

## Data

**Seasons.** League season = index + 96 for Madden 26 (indexes 0–6 = seasons 96–102) and index + 103 for Madden 27 (103–105 so far). The two cycles are separate games with different teams and users; season 103 starts everyone at 1500 and nothing carries from 102 to 103. Both cycles number their raw season index from 0, so never replay them in one call.

**Madden 26 archive:** [archive/madden26/games.json](../archive/madden26/games.json). 1,904 regular-season games (272 per season), no playoffs. `teamId` is not stable: season 96 uses ids 777781248–777781282, seasons 97–102 use 773718016–773718052, with no overlap. Key on `abbrName` and normalize `ARI` to `AZ` (season 96 says AZ, 97–102 say ARI). All seven seasons then have the same 32 teams.

**Madden 27:** live `GET https://rzs-stats-production.up.railway.app/api/elo/games`, snapshotted in [backend/src/test/resources/elo/games-snapshot.json](../backend/src/test/resources/elo/games-snapshot.json) (668 games, includes playoffs, through display Week 7 of season 105). Refresh the fixture before a run if more games have been played. Week indexes are 0-based; display Week = index + 1; playoffs are weeks 18+.

**Ownership data: does not exist in the project.** [TeamEntity.java](../backend/src/main/java/com/rzs/stats/model/entity/TeamEntity.java) has no owner field and [NeonSportzClient.java](../backend/src/main/java/com/rzs/stats/client/NeonSportzClient.java) does not read one. Not yet checked: whether the NeonSportz API (`https://neonsportz.com/api/leagues/RZS/`) exposes a user or owner per team. Check that first; it would remove the need to enter anything by hand.

**What the user will provide, per cycle:** a list of ownership changes as (team abbreviation, season in which the new owner first played). Useful extras: whether the new owner is brand new to the league or a returning owner, and, for a returning owner, which team and seasons they played before. Madden 27 changes are easy to list; Madden 26 may be incomplete, so the plan should say what to do with unknown history (for example, treat an unlisted team-season as unchanged and flag the cycle as lower confidence).

## Questions to settle before building

1. **What happens at an owner change?** Candidates: reset to 1500; retain a much smaller fraction (try 0.0–0.5); or a returning owner starts from their own previous final rating, regressed. Test them rather than assume.
2. **When does the reset apply?** At the season boundary, before the new owner's first game, matching how regression works today. What about a mid-season change (owner leaves after some weeks)? Ask the user whether those happen.
3. **Does a returning owner carry rating across teams?** If someone moves from team A to team B, does their rating follow them? That needs per-owner tracking, not just a per-team flag, and is a bigger build.
4. **How do first-time owners differ from experienced ones?** Possibly a skill prior (a new owner on a strong franchise).
5. **Does the stable-owner retention need re-tuning?** Likely yes: with changes handled separately, retention for continuing owners may want to be higher than 0.78. The user's floor is 0.75 and should still hold for continuing owners.

## How to test it

Reuse the existing harness: [EloBacktestReport.java](../backend/src/test/java/com/rzs/stats/service/EloBacktestReport.java), gated by `-DeloBacktest=true`. It replays each cycle separately from 1500, calls the production `EloService.play`, `probability` and `regress` per game, and already supports a per-week K schedule. Run with `cd backend && ./mvnw test -Dtest=EloBacktestReport -DeloBacktest=true` (about 30 seconds for 9,000 configs). Outputs go to `backend/target/elo-backtest/`.

What to add:
- A per-(team, season) owner-change flag per cycle, as an input file.
- At each season boundary, apply the chosen rule to flagged teams in place of the normal `regress`.
- Sweep: retention for continuing owners (0.75–0.90), and the rule for changed owners (retention 0, 0.25, 0.5, or the normal value as the control).
- Grade all completed games in both cycles, as before. Every prediction is pregame, so no train/test split is needed.

**Scoring.** Primary: all-games log loss against 0.594828. Report it per cycle and per season. Add the key subset: **first-season games of flagged teams**, since that is where the effect lives. Also report Brier, calibration by tier, share of games with a favorite at 70%+, and end-of-season rating spread. Adopt only if it beats the no-owner baseline over all games without hurting spread, and it should win in most seasons that had owner changes.

**Weak evidence to expect.** Owner changes are rare (a few per season at most). The subset may be a few hundred games, so use the week-block bootstrap in the harness and keep the rule simple (one extra parameter), or the test will overfit. Report the subset's confidence interval, not just its mean.

**Controls that must still pass** (existing assertions): old defaults reproduce season 104 log loss 0.5761; near-zero K gives 0.6931; every team is exactly 1500 at season 103 week 0; 32 non-1500 ratings carry at each of the six archive boundaries; exactly eight within-cycle boundaries; never 102 to 103. A new control: with no flagged teams, results must equal the committed baseline exactly.

## If it works: what building it in production needs

Not for the testing session, but so nobody is surprised:
- A data source for ownership (a NeonSportz field if one exists, else an admin-entered table).
- A new field or table, a schema change, and Admin UI to enter changes.
- Changes to [EloService.java](../backend/src/main/java/com/rzs/stats/service/EloService.java) `compute` so regression is per team, not a single multiplier for everyone.
- Updates to [AboutPage.jsx](../frontend/src/pages/AboutPage.jsx), [docs/statistics.md](statistics.md) and a changelog entry. The project rule: every stat change is explained on the About page.
- Cache eviction: the `eloHistory` cache must be evicted when ownership data changes.

## Cautions carried over from earlier sessions

- **Never carry ratings between the cycles.** Madden 27 starts everyone at 1500.
- **Retention curve is flat; do not over-read small differences.** 445 of 9,000 tried settings land within 0.002 of the best, so many choices are ties. Prefer fewer knobs.
- **Home field is 0.** Pooled estimate -8 Elo (95% CI -21.5 to +5.3); home teams won under 50% of games in both cycles.
- **Early-season K boost was tested and dropped** (gain 0.0006 LL; better in meaningful amounts in 2 of 10 seasons). It might look different once owner changes are modeled, because the new owners' early weeks are where the boost should matter. Worth retesting only on flagged teams.
- Margin-of-victory error was not informative for choosing between settings.
- The early-season weakness at season 105 that started this project was within normal noise (archive weeks 1–6 windows ranged 0.486 to 0.747 log loss).
- The harness's own "locked candidate" line in older reports is unreliable (it picked home field -25 through a tie-break); use the all-games report.

## Files

- Earlier reports (in `backend/target/elo-backtest/`, gitignored, regenerable): `report-all-games.md` is the current one; `report.md` and `report-k-boost.md` are earlier phases.
- Harness: [EloBacktestReport.java](../backend/src/test/java/com/rzs/stats/service/EloBacktestReport.java), fixtures in `backend/src/test/resources/elo/`.
- Elo math: [EloService.java](../backend/src/main/java/com/rzs/stats/service/EloService.java), config: [EloConfig.java](../backend/src/main/java/com/rzs/stats/model/dto/EloConfig.java).
- Definitions: [docs/statistics.md](statistics.md) (Elo section, with how the current defaults were chosen), original spec [elo-ratings-implementation.md](elo-ratings-implementation.md).
- Project rules: [CLAUDE.md](../CLAUDE.md). Work on a feature branch (suggest `feature/elo-owner-changes`), never master. Codex implements substantial code; Claude reviews.

## Results: reset-to-1500 test (2026-11-19)

Ran `cd backend && ./mvnw test -Dtest=EloBacktestReport -DeloBacktest=true -DeloOwnerChanges=true`. Fixture: [owner-changes.csv](../backend/src/test/resources/elo/owner-changes.csv), 14 resets (10 Madden 26, 4 Madden 27), built from Discord ✍league-changes dated against 🔔weekly-advance. A change announced in week W resets before W+1; offseason changes reset at next W1 and replace regression. Excluded: Lions round trip (S96 W4–5), Bengals at S96 start, the Jun 2026 Vikings fill (Madden 27 setup, no advances between May 21 and Aug 16). Output: `backend/target/elo-backtest/report-owner-changes.md`.

**Verdict: do not adopt a hard reset to 1500.** Reset-on is worse than reset-off at every continuing retention (0.75–0.90), with all-games LL +0.0010 to +0.0016 (at 0.78: 0.596332 vs baseline 0.594828). It wins only 3 of the 8 seasons that had changes (101, 104, 105); it loses 96, 98, 99, 100 and 103. Season 99 (LV and NO reset at W1) is the worst, at +0.015. Changed-team subset (n=142): LL 0.5404 off vs 0.5570 on, difference +0.0166, 95% week-block CI [-0.036, +0.066], which does not exclude zero.

Reading: the prior season's rating still carries information after an owner change, so wiping it throws signal away. Untested: partial regression for changed teams (0.25, 0.5), per-owner carry across teams, and a changed-team K boost. The Madden 27 cycle as a whole improves with resets (about -0.003 LL), as do S101, S104 and S105, while the archive worsens (about +0.003), so a softer rule is the only variant worth a follow-up.

### Follow-up: mid-season regression only (2026-11-19)

Rule: a mid-season owner change (7 of the 14 rows: S96 W15 IND, S98 W6 NYG, S100 W13 NE, S101 W3 ATL, S101 W6 MIN, S101 W16 MIN, S103 W11 MIN) applies the normal retention multiplier at the start of that week. A between-season change (the other 7) gets no special handling. Same harness and report; third arm `midseason-regress`.

Result: all-games LL 0.594413 at retention 0.75 vs 0.594549 with no handling (-0.000137), and -0.00013 to -0.00015 at every retention 0.75–0.90. The harness verdict line says ADOPT because the pre-set criteria were met (beats 0.594828, passes guardrails, 5 of 8 changed seasons won at 0.75, 6 of 8 at 0.78+). Do not read that as a real win: the criterion counts any per-season LL difference, however small, and the gain is about a quarter of the 0.0005 band the handoff already calls noise. Mid-season-changed subset (n=57 games): -0.0067 LL, 95% week-block CI [-0.029, +0.014] at 0.78, which includes zero. Directly affected seasons won: 3 of 5. Only 7 team-events differ from the baseline.

Worth noting: on that 57-game mid-season subset the hard reset did better still (LL 0.6272 vs 0.6335 for regress and 0.6402 for no handling, at 0.78). The hard reset's damage comes from the 7 between-season changes (S99 above all), not the mid-season ones. A hybrid (hard reset mid-season, nothing between seasons) is untested and is the obvious next arm, with the same thin-evidence caveat.

Takeaway: the direction is right (hard reset hurts, a normal regression does not) but the evidence is too thin to justify the production work (ownership table, Admin UI, per-team regression in `EloService.compute`, About page, cache eviction). Revisit when more owner changes have accumulated.
