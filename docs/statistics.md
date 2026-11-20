# Statistics

**The ethos**: surface the truth behind the scoreboard. W-L records are noisy — one-score games are largely random. PyPAT and SoS cut through that noise to show who is actually playing well and who has been lucky. Every design decision (H2H exclusion in SoS, game-weighted SoS Total, prior-season default for active seasons) exists to minimize bias and maximize signal.

## Key Concepts

### PyPAT (Pythagorean PAT Win Expectancy)
Win expectancy derived from scoring differential, not W-L record. Uses Chase Stuart's dynamic exponent.

```
base     = (pf + pa) / games
exponent = base ^ 0.251
pyPAT    = pf^exponent / (pf^exponent + pa^exponent)
```

Scale: 0–1. 0.5 = break-even. A team with 0.70 PyPAT would be expected to win 70% of games given their scoring margin.

### Luck
`winDiff = actual wins − (pyPAT × games)`

Positive = won more games than scoring margin predicted (lucky). Negative = deserved more wins. Normalizes over time — a strong predictor of regression or rebound.

### Strength of Schedule (SoS)
Average PyPAT of opponents, with these refinements:

1. **Game-weighted, not opponent-weighted**: The average runs over one entry *per game on the schedule*, so a division rival played twice contributes twice. Averaging distinct opponents instead under-weights division rivals (14 unique opponents across a 17-game schedule) and was worth up to 5 points of SoS and 12 places of ranking.

2. **H2H exclusion**: Each opponent's PyPAT is recalculated *removing games vs. the subject team*. Prevents circular bias — without this, strong teams would artificially lower their own SoS.

3. **Three columns**:
   - **SoS Played**: Opponents faced so far
   - **SoS Left**: Remaining opponents (from unplayed games)
   - **SoS Total**: Game-count-weighted average: `(SoS_Played × gamesPlayed + SoS_Left × gamesLeft) / totalGames`
     - Because both sides average one value per game, this is exactly the mean over the full schedule
     - **NOT a union average** — that approach lets weak played-only opponents drag Total below both Played and Left

4. **Toggle (active season only, 3+ games played)**: Current-season vs prior-season opponent PyPAT. Prior season is the default — early in a season, current-season sample sizes are too small to be meaningful. The toggle is hidden until some team has played 3 games, because before that an opponent's only games are the ones against you and nothing survives the H2H exclusion.

5. **Unratable opponents are null, never 0.0**: If an opponent has no games left after H2H exclusion, they contribute nothing. If *no* opponent on a column could be rated, the column is `null` — "no data", which is not the same as a 0.0 rating. Each column is weighted by the games it actually rated, so Total stays the mean over every rated game.

---

### Elo
Rolling team strength that carries across seasons. Config is persisted and tunable at `PUT /api/admin/elo/config` (`EloConfig` record, validated on write):

| Knob | Default meaning |
|------|-----------------|
| `initialRating` | Every team's starting rating (1500) |
| `k` | Step size per game; validated to 1–100 (25) |
| `divisor` | Logistic scale for win probability (400) |
| `movEnabled` / `marginCap` | Margin-of-victory multiplier, capped at `marginCap` points (28) |
| `homeFieldAdvantage` | Rating points added to the home side for the prediction (0) |
| `offseasonRetention` | Fraction of distance from `initialRating` kept between seasons (0.78) |

`EloHistoryService` **replays every game in order** to build history — ratings are derived, never stored per game. Playoffs count. Changing config changes all history, so the `eloHistory` cache is evicted with the rest.

**How the defaults were chosen.** Retention 0.78 and cap 28 come from a backtest that grades every completed game, 2,572 across two independent Madden cycles (Madden 26, seasons 96–102, and Madden 27, 103 onward). Each cycle is replayed from 1500; a new cycle never inherits ratings. Every prediction uses only earlier games, so no split is needed. About 9,000 settings were tried, including an early-season K boost:

- **Retention** is nearly flat from 0.67 to 0.80 (within 0.0005 log loss) and worse toward 1.0; 0.90 costs 0.0024. League strength is stickier than the NFL's one-third regression, so the floor was set at 0.75, which costs 0.0003.
- **Home field is 0.** Pooled across both cycles the estimate is -8 Elo (95% CI -21.5 to +5.3), and home teams won 48.6% and 49.1% of games.
- **K 25 / divisor 400 stay.** Only K/divisor affects predictions; the divisor otherwise just rescales the displayed ratings.
- **The early-season K boost was dropped:** the best version gained 0.0006 log loss and beat the no-boost setting by a meaningful margin in only 2 of 10 seasons.
- The cap barely matters; margin of victory itself does (turning it off costs about 0.019).

The chosen setting beats the old defaults (retention 0.90, cap 21) by 0.0028 log loss over all games (0.5977 to 0.5948; 95% interval -0.0047 to -0.0009) and in 9 of 10 seasons. The gain is small, and 445 of the settings tried land within 0.002 of the best, so the choice among them rests on simplicity. Rerun the backtest harness (`EloBacktestReport`, gated by `-DeloBacktest=true`) after each season; retention rests on 8 season boundaries.

Original Elo spec: [Elo ratings implementation](elo-ratings-implementation.md) — its worked examples use the original K 25, cap 21, retention 0.90.

### Outlook tiers

**Outlook tiers** rate how competitive an unplayed game should be, off the favorite's win chance: Toss-up <55%, Tilt <60%, Lean <70%, Likely <85%, Solid above. Each tier has its own color, deep at the competitive end of its band and fading to nearly white at the far end. `upsetInfo` reuses the same bands to size upsets on completed games, and deliberately returns nothing for a Toss-up — neither side was favored enough for the result to surprise.

### TANY/A and RUSH+ (QB stats)
Total Adjusted Net Yards per Attempt — one number for passing *and* rushing:

```
TANY/A = (passYds − sackYds + rushYds + 20×(passTD + rushTD) − 45×(INT + fumblesLost))
         ÷ (passAtt + sacks + rushAtt)
```

Rushing counts in both numerator and denominator, so volume alone can't inflate it. RUSH+ isolates the rushing contribution: yards above 4 per carry, +20 per rush TD, −45 per estimated lost fumble. **Every estimated fumble is charged to RUSH+**, so it is read alongside TANY/A, not added to it.

Sack yardage and lost fumbles are not in the per-player feed — they're estimated from team game stats (`teamSacks`, `teamFumblesLost` on `QbGameStatEntity`).

**Qualification** gates the leaderboard. Default minimum attempts by scope: WEEK → 10, SEASON → `10 × team games played`, ALLTIME → 250 (`ALLTIME_MIN_ATT`), or 50 for playoffs (`ALLTIME_PLAYOFF_MIN_ATT`). Unqualified QBs are filtered out unless `includeUnqualified=true`, get no `rank`, and are excluded from heat-map ranges. `minAtt` overrides the default.

### Team efficiency (Pts/Drive, Pts/Play, Series %)
Play-by-play does not exist in the feed, so these are rebuilt from per-game box-score totals. Season figures sum the components across games first and divide once, so they are never averages of per-game rates. Any rate with a zero denominator is `null`, not 0.

```
plays   = passAtt (every passer) + rushAtt (every rusher) + sacks taken
offTD   = passTD + rushTD
drives  = offTD + FGA + punts + INT + fumbles lost + (4th-down att - conv)
offPts  = 6*offTD + 3*FGM + (XPM + 2*2PtConv) * min(1, offTD / (XPA + 2PtAtt))

Pts/Drive = offPts / drives          Pts/Play = offPts / plays
Series %  = (1D + offTD) / (1D + drives)
Net Pts/Drive = offense Pts/Drive - defense Pts/Drive
```

- **Offensive points only.** Each touchdown earns one PAT try, so tries beyond our own touchdowns followed defensive or return scores. The PAT points are scaled down to the share that followed offensive touchdowns. Rebuilding the whole scoreboard from the feeds (offensive and defensive touchdowns, field goals, PATs, safeties) matched 109 of 116 sampled team-games exactly; the misses fit kick and punt return touchdowns, which no feed reports, so those points are never charged to either side.
- **Drives are estimated** from how each one ended. End-of-half kneel-downs and clock-outs are not visible in the box score and are not counted.
- **Defense** is the same formulas applied to the opponent's row in the same game. A game counts only when both teams have a row, which skips forfeits and concessions.
- `3rd %`, `RZ TD %`, `TO/Drive` and `Sack %` (sacks / (pass attempts + sacks)) complete the table. On defense, turnovers and sacks become takeaways and sacks made.
- Raw only: no opponent adjustment yet.
