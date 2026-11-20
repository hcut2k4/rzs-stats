> **Defaults superseded.** This is the original specification and its worked examples use cap 21 and 90% retention. The shipped defaults are now cap 28 and 78% retention; see [Statistics](statistics.md#elo) for why.

# Red Zone Elo Ratings — Implementation Specification

## Objective

Implement a persistent, multi-season Elo rating system for our 32-team Madden league, covering the current Madden 27 cycle (approximately 6–7 seasons).

The goal is to measure demonstrated team strength over time, recognizing consistently successful teams while remaining responsive to improvements and declines.

Use FiveThirtyEight's NFL Elo methodology as the foundation, with Madden-specific adjustments described below.

**Important:** Elo must remain an independent rating system. Do not incorporate PyPAT, Luck, Strength of Schedule, Neon power rankings, or other proprietary statistics into its calculation.

We are not attempting to create a statistically perfect predictive model. We want a reliable, reasonably responsive measure of team strength that works well across multiple Madden seasons without unnecessary complexity.

## 1. Default configuration

| Parameter | Default |
|---|---:|
| Initial rating | 1500 |
| Base K factor | 25 |
| Elo probability divisor | 400 |
| Margin-of-victory adjustment | Enabled |
| Margin cap | 21 points |
| Home-field advantage | 0 |
| Offseason rating retention | 90% |
| Weekly rating decay | None |

Keep these parameters configurable within the ratings engine, but use the defaults without requiring additional statistical calibration.

## 2. Expected win probability

For teams A and B with pregame ratings `Ra` and `Rb`:

`P(A) = 1 / (1 + 10^((Rb - Ra) / 400))`

`P(B) = 1 - P(A)`

Use the ratings immediately before the game. Do not use rankings, records, or any additional information.

Example: A team rated 1600 against a team rated 1500 has approximately a 64% probability of winning.

## 3. Margin-of-victory multiplier

Implement FiveThirtyEight's logarithmic margin adjustment, with a 21-point cap to limit extreme Madden blowouts.

First:

`MOV = min(abs(scoreA - scoreB), 21)`

Then:

`WinnerEloDiff = PregameWinnerElo - PregameLoserElo`

Calculate the multiplier:

`MOVMultiplier = ln(MOV + 1) * (2.2 / (2.2 + 0.001 * WinnerEloDiff))`

Use natural logarithms.

This formula provides diminishing returns for larger winning margins and reduces the additional credit awarded when a strong favorite wins by a large margin.

An upset blowout should be more informative than an equally large victory by a heavy favorite.

**Do not substitute Neon power-ranking differences for WinnerEloDiff.** FiveThirtyEight's implementation uses the pregame Elo difference itself.

For tied games, use a multiplier of 1 rather than zero, so the tie can still update ratings according to the teams' expectations.

Guard against invalid denominators and non-finite results, although the normal league rating range should not approach those extremes.

## 4. Elo updates

Use:

`RatingChangeA = K * MOVMultiplier * (ActualA - P(A))`

Where:

- K = 25 by default.
- ActualA = 1 for a win, 0 for a loss, and 0.5 for a tie.
- P(A) = the pregame win probability.

Update both ratings symmetrically:

`NewRatingA = OldRatingA + RatingChangeA`

`NewRatingB = OldRatingB - RatingChangeA`

Both ratings must be updated from their pregame values, not sequentially using the already-updated opponent rating.

This preserves the zero-sum nature of individual game adjustments.

Do not round intermediate calculations. Only round values for presentation.

Expected behavior for equally rated teams using K = 25:

| Result | Winner Elo change |
|---|---:|
| 1-point win | +8.7 |
| 7-point win | +26.0 |
| 14-point win | +33.9 |
| 21-point win | +38.6 |
| 35-point win | +38.6 |

These examples assume a zero pregame Elo difference.

## 5. Multi-season continuity

At the beginning of the first season in the cycle, initialize all 32 teams at 1500.

At each subsequent season transition, retain 90% of each team's rating deviation from 1500:

`NewSeasonElo = 1500 + (PreviousFinalElo - 1500) * 0.90`

For example:

- 1750 becomes 1725.
- 1600 becomes 1590.
- 1500 remains 1500.
- 1400 becomes 1410.
- 1250 becomes 1275.

Apply this regression exactly once at each season boundary, before that season's first game.

Do not reset ratings when the regular season ends.

### No additional weekly decay

Do not independently decrease the influence of prior-season Elo as the current season progresses.

The Elo update mechanism already progressively incorporates new results. A second weekly decay mechanism would add unnecessary complexity and potentially overreact to recent performance.

Do not reset Elo differences to zero during the first 4–6 weeks of a new season. Historical evidence remains useful immediately.

## 6. Chronological calculation

Process historical games chronologically across the entire Madden cycle.

Use the stable game chronology already available in the application. Every game must use ratings that existed before its result was incorporated.

Within a normal league week, calculate each matchup from the ratings at the start of that week, then apply the resulting adjustments. This ensures processing order does not affect the outcome when each team plays once per week.

Maintain weekly Elo snapshots for all 32 teams, including teams that did not play. A bye week should leave a team's rating unchanged.

If a team has multiple games in the same labeled week, handle them chronologically rather than incorrectly applying simultaneous updates.

Ensure every game is applied only once.

## 7. Output data

The ratings engine should make available:

### Current team ratings

- Team identifier
- Current Elo rating
- League rank
- Elo change from previous week
- Previous week's rank
- Games contributing to the rating

### Historical weekly ratings

For every team and week:

- Season
- Week
- Starting Elo
- Ending Elo
- Net rating change
- League ranking

### Game-level details

For each processed game:

- Both teams' pregame Elo ratings
- Each team's predicted win probability
- Final score and scoring margin
- Applied MOV multiplier
- Elo points gained or lost
- Both teams' postgame Elo ratings

### Matchup projections

Given two current Elo ratings, calculate each team's probability of winning their next matchup.

Use the same probability formula as the historical calculations.

## 8. Calculation requirements and tests

Implement straightforward unit tests to verify that:

- The calculation is deterministic and reproducible from identical inputs.
- Both teams begin at 1500 in the first season.
- Higher-rated teams have higher expected win probabilities.
- Upsets produce larger changes than expected victories with otherwise equivalent margins.
- The margin-of-victory multiplier behaves correctly.
- The 21-point margin cap works as intended.
- Game-level Elo changes are zero-sum.
- Bye weeks do not change ratings.
- Offseason regression applies exactly once per season.
- Historical games are processed in the correct order.
- Missing or incomplete games are handled safely.

These are correctness tests only. Do not build a statistical calibration framework, parameter optimization engine, or historical prediction comparison system.

## 9. Implementation approach

Build this as an independent Elo calculation module/service using the application's existing game data.

Preserve the complete historical rating timeline so the frontend can display rankings, changes over time, matchup projections, and weekly movers.

Keep the mathematical engine separate from UI and API presentation logic.

Avoid overengineering. Implement the defined model with its stated defaults rather than introducing additional statistical techniques or predictive features.

**The final result should be an authentic Elo rating system, adapted for Madden's persistent team quality and relatively short competitive cycle—not a composite power score.**

Reference methodology: https://github.com/fivethirtyeight/nfl-elo-game/blob/master/forecast.py