# Madden playoff tiebreakers: session handoff

Last updated 2026-11-21. Read this first. Every experiment, with its numbers, is in `research/seeding/LEDGER.md` (round 3 is the current one). Older models (M3, M4, "plain rules", the "farthest from average" chain) are superseded.

## Goal

The RZS stats site should predict the playoff field and seeds Madden 27 actually produces. Madden's tiebreakers differ from the real NFL rules when teams tie, so the wrong teams sometimes make the playoffs.

## Working rules with the user

- Explain in plain English, with examples from real leagues. No jargon or internal labels.
- Only actual playoff matchups and bracket screenshots are ground truth. Madden's postseason structure is established fact: seeds hold for the whole postseason, the lower seed is always away, the top remaining seed always plays the lowest remaining seed. Ignore mid-season standings, elimination and clinch flags (Madden's own clinch flags are buggy: one league flags a 5th seed as a division winner).
- Madden's seeds 8-16 from playoff-week standings may be used as secondary evidence (user decision, 2026-11-21).
- Don't change production code to fit a new hypothesis without the user's approval.
- Nothing is committed yet. Branch `feature/seeding-research`. Commit only when asked, never to master.

## The rule (Madden 27, launch build onward)

Teams are ranked by win percentage (a tie game counts as half a win). Every group of teams with the same percentage is ordered like this:

1. **Count each team's wins against the other teams in the group.**
2. **If every count is different,** the team with the most wins is first, and so on down.
3. **Otherwise, find the biggest set of teams that share the same count. That set goes first, even if its count is the lowest.** Madden orders that set by starting over at step 1 with just those teams. Everyone else follows, ordered by their count (most first); any of them who share a count are ordered by starting over among just them.
4. **If two or more sets tie for biggest,** everyone outside them drops to the bottom (ordered by count), and the tied sets start over at step 1 among themselves. If that changes nothing, move to the next tiebreaker.
5. **If all counts are equal,** use the next tiebreaker the same way, in this order: division record, record against the opponents all of them have played, conference record, strength of victory, strength of schedule, conference point differential, overall point differential.

Two teams tied is just the same rule: head-to-head, then division record, common opponents, conference record, strength of victory, strength of schedule, points. That is the NFL's division checklist, and Madden uses it for wild cards and seeding too.

Then:
- **Division winner:** the first team in the division's tied group.
- **Seeds 1-4:** the four division winners in this order.
- **Seeds 5-7:** the first three of all the other teams in this order.

### Why it behaves so strangely

It looks like one coding mistake. The code assumes that the teams still tied after a tiebreaker are the best ones and puts them first. Usually they are. But when the tied teams are the *worse* ones, the better team gets pushed below them. That is how beating a tied rival can cost a team its playoff spot.

### Examples

- **Our league, season 104 NFC (10-7 for two wild cards).** Washington swept Philadelphia; Detroit played neither. Wins against the group: Washington 2, Philadelphia 0, Detroit 0. The biggest set is Philadelphia and Detroit, so they go first and get in. Washington, who swept Philadelphia, is out.
- **Our league, season 103 NFC (9-8 for two wild cards).** Atlanta, Arizona, Chicago, Detroit and the Rams. Wins against the group: Arizona 3, Atlanta 2, Detroit 2, Chicago 0, Rams 0. Two sets of two tie for biggest, so Arizona drops to the bottom. Among the other four, division record makes Chicago and the Rams the biggest set (both .500), so they get in, although both were swept by division rivals.
- **Your full-season sim, AFC (three 11-6 division winners).** Indianapolis beat New England; Denver played neither. Counts: New England 0, Denver 0, Indianapolis 1. Denver and New England go first; Denver wins their common-games tiebreak. Seeds: Denver 1, New England 2, Indianapolis 3, exactly as the bracket screen shows.
- **A five-team tie (league "44", 2026 NFC, 7-10).** Counts: San Francisco 2, Dallas 2, Arizona 2, Washington 3, Minnesota 1. The three teams on 2 go first, Washington and Minnesota after. Among the three, Arizona beat San Francisco twice, so Arizona has the most wins and goes last of them; San Francisco beat Dallas. Madden's order: San Francisco, Dallas, Arizona, Washington, Minnesota. San Francisco took the last wild card although Arizona swept it.

## Evidence

- **Final test on never-seen data** (137 seasons from 123 leagues, held back the whole time and scored once after the rule was frozen): every tiebreak decision correct. Division titles 118/118, two-team wild cards 53/53, wild cards with three or more teams 41/41 (14 of them with four or more teams), division-winner seeding 152/152, wild-card seeding 130/130. The whole conference is exactly right in 273 of 274; the one other conference differs for a reason outside the tie decisions and was not examined, to keep the test one-shot. For comparison, the real NFL rules get 188 of 274 and the previous best model 259 of 274.

- **All bracket decisions after launch** (759 seasons): 2,947 of 2,951 tiebreak decisions reproduced (99.86%). Ties of three or more teams: 515 of 518; four or more teams: 79 of 82.
- **Madden's complete standings order** from 150 leagues captured during their playoffs (records verified against Madden's standings): every playoff seed in 407 of 407 tied groups, and 1,035 of 1,037 tied groups in full (the two misses only swap non-playoff positions).
- **Screenshots:** all six conferences (our seasons 103 and 104, and the full-season sim) match seeds 1-7 exactly.
- **What was ruled out:** filling one spot at a time (374 of 518), reducing to one team per division first (308 of 518), measuring head-to-head as a percentage or by series (much worse), skipping or reversing strength of schedule, a Week 17 cutoff (twice).

## Early builds were different

Two leagues (BSD and M27GM) played all their seasons before Madden 27's general launch (their data predates every other league's first season). They follow the real NFL rules almost exactly (65 of 69 decisions). Something in the launch build changed the tiebreak code. The rule above applies to everything from launch onward, including our league.

## Known limits

- **Six decisions after launch are not explained** (0.15%): four in older seasons whose records could not be checked against Madden (BOBL 2026 NFC, T2H 2026 AFC, LD 2026 NFC division-winner order, 4THSL 2026 AFC South title), and two non-playoff orders (DSM 2027 NFC 8th/9th, FIRST 2027 AFC 10th-14th). In 4THSL, Madden's seeding gave the division to the team with the weaker schedule, while its own clinch flag picked the other team; there is only one such example.
- **This describes what Madden does, not its code.** The "biggest tied set first" wording is the simplest description that fits every verified case.

## Where things are

- `research/seeding/explore/`: the reference implementation of the rule (`ctop2.py`, function `R`, option `tie_after='restart'`) and the scripts that found it; `reference_results.json` holds the per-category numbers.
- `research/seeding/engine.py`: config `madden27` (this rule; identical to the reference on all 1,546 discovery conference-seasons), `madden27_prelaunch` (exact NFL rules, early builds), plus all earlier configs. `nfl` reproduces every real NFL seed 2002-2025. Tests: `python3 -m unittest discover research/seeding/tests` (148 pass).
- `research/seeding/LEDGER.md`: every hypothesis with numbers. `data/fresh_log.txt`: the single fresh-test run (the frozen rule plus two comparison models, scored together). `FROZEN.txt`: hashes of the frozen rule.
- `backend/src/test/resources/playoffs/neon/inventory/`: the inventory of all 1,130 NeonSportz leagues and `inventory.py` to refresh it.
- Production `MaddenSeeding` (Java) is still the old M3 model.

## Next steps

1. Ask the user before replacing `MaddenSeeding` with this rule (a Java port of `madden27`; update `AboutPage` and add an `ExportMenu` for any new page).
2. For new RZS seasons, predict with `madden27` before looking at the bracket.
