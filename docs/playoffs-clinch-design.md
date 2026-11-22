# Clinch / Eliminated: design (sound by construction)

A marker must never be wrong; a missing marker is the fallback. One class: `playoffs/ClinchAnalyzer.java` (same package as PlayoffSeeding so it can call the Madden seeder).

## Layer 1: record math (no tiebreakers needed)

Points = 2W + T per team; `min(t)` = current record with every remaining game lost, `max(t)` = every remaining game won. Extremes taken independently per team cover more than the possible outcomes, so every check is sound. Tiebreakers never matter when `min(a) > max(b)` (all rules sort by win % first). Equal win % always counts as a threat.

A(t) = conference teams u != t with max(u) >= min(t). S(t) = conference teams with min(u) > max(t).

| Marker | Condition |
|---|---|
| Clinched division | min(t) > max(u) for every division rival |
| Eliminated from division | some rival has min(u) > max(t) |
| Clinched 1 seed | min(t) > max(u) for every other conference team |
| Eliminated from 1 seed | any conference team u has min(u) > max(t) |
| Clinched playoffs | clinched division, or sum over divisions D of max(0, abs(A∩D) - 1) <= 2 |
| Eliminated from playoffs | eliminated from division and sum over D of max(0, abs(S∩D) - 1) >= 3 |

Implications applied afterwards: clinched 1 seed => clinched division => clinched playoffs; eliminated from playoffs => eliminated from division => eliminated from 1 seed. "Top 7 by win %" alone is NOT sufficient for clinching (a worse-record division winner still takes a seed).

## Layer 2: exhaustive search over W/L/T

- Depth-first over all remaining regular-season games in the whole league (not per conference: SoV/SoS link conferences). Open (team, goal) pairs only.
- Node pruning: treat assigned games as played and run Layer 1; if a pair is proven achieved in every completion set `seenTrue`, proven failing everywhere set `seenFalse`; skip the subtree when every open pair is settled. No symmetry/dominance pruning (Madden's rule is not monotonic: a win can cost a team its spot).
- Leaf: win = 1-0, tie = 0-0; seed with Madden rules; set seenTrue / seenFalse per pair.
- Point-margin rule: if a pair's result depended on a decision made at a margin-dependent step, set both flags (pessimistic for clinching, permissive for elimination).
- After the search: CLINCHED if !seenFalse, ELIMINATED if !seenTrue.
- Only when n <= 16 remaining games (cap lower, e.g. 10, if the Phase 1 benchmark says so), 90 s budget, parallel across the first two games' subtrees. On timeout or n > 16: Layer 1 only. Runs asynchronously after each sync; cached (Caffeine, key = hash of rules + all games; add to `allStatsCaches` in CacheNames).
- Validate 17 games per team; otherwise Layer 1 only.

## Engine addition

`Result` gains `List<PointTie> pointTies`:
```java
record PointTie(String conference, boolean divisionTitle, Set<String> tied, Step step)
```
Emitted each time a tied set is split by, or left unresolved after, a margin-dependent step (NET_POINTS_*, COMBINED_RANKING_*, NET_TOUCHDOWNS, COIN_TOSS, UNRESOLVED). Ambiguous when: any team in `tied` has a remaining game counted by the step; or the step is combined ranking / net touchdowns / coin toss; or unresolved. A decision that falls through every checklist step to the alphabetical fallback (`Step.ALPHABETICAL` in the Trace) is also ambiguous: the engine's ordering there is arbitrary and different margins could change it (review finding: two division rivals tied on every criterion after identical W/L results but different margins). divisionTitle=true makes every team and goal in that conference ambiguous; otherwise only members of `tied` for a goal whose cutoff (position 1 for the 1 seed, 7/8 for playoffs) falls inside the block the set occupies. A non-empty `unresolvedConferences` makes the whole conference ambiguous. Relies on the engine ordering each tied set as one contiguous block with no state carried between groups.

## Interface
```java
enum Goal { PLAYOFFS, DIVISION, ONE_SEED }
enum Marker { CLINCHED, ELIMINATED, NONE }
record Matchup(int week, String home, String away) {}
record Season(List<Team> teams, List<Game> completed, List<Matchup> remaining) {}
record Analysis(Map<String, Map<Goal, Marker>> markers, boolean exhaustive, long seeded) {}
static Analysis analyze(Season season, Function<List<Game>, Result> seeder, Duration budget)
```
The step turning an outcome into Games is shared with the Phase 2 simulator.

## Test oracle
- Synthetic 16-team leagues (2 conferences x 2 divisions x 4), random schedules with n <= 9 remaining, ties included, records forced level so point steps are reached.
- Reference oracle: enumerate all 3^n outcomes x margins {1, 7, 35} per decided game with real scores; no Layer 1, no pruning, no PointTie.
- Properties: every marker holds in every oracle outcome; any outcome where margins change a status was flagged ambiguous; odds are exactly 1.0 under CLINCHED and 0.0 under ELIMINATED.
- Regressions: 7th-best record missing because of a weaker division winner (no clinch); season-104 Washington (a win costs the spot); a point-differential division title; incomplete schedule (Layer 2 off).
- Differential test against research/seeding/engine.py madden27 on fixtures.

## Risks and cuts
Risks: incomplete PointTie metadata or engine state leaking between groups (oracle guards it); Layer 2 depends on the tiebreak model (99.85% accurate; strict mode = treat every tie at a goal's cutoff as ambiguous); missing games; runtime in weeks 16-17.
Cut order if short on time: parallelism, node pruning (cap n at 10), block-position refinement (conference-wide ambiguity), Layer 2 entirely (Layer 1 alone is sound).
