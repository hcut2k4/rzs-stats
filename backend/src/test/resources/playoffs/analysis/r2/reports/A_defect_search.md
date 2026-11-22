# Defect search: Madden seeding

## Findings

The strongest constructive implementation is **A-cache: 34/34 conferences, 3/3 partial-season groups**. It has no team-name check and no explicit “division already has a wild card” exception. A lazy division-order cache creates that behavior. This is an existence proof, not evidence that Madden has such a cache.

The more defensible working approximation is **B-shared: 33/34, 3/3**, missing only SFL-2026 AFC. It removes M3's exception and its special multi-club tail order. **C-no-reduction: 32/34, 3/3** removes the special reduction machinery altogether; its misses are DM2-2027 NFC and SFL-2026 AFC. The final utility-ranked pass also found **F-loss-elimination: 32/34, 3/3 with nine sites**, missing SFL-2026 AFC and MMGA6-2027 AFC. It uses raw group losses and repeated bottom elimination, with no division reduction or special common-first tail. This is the simplest high-fit candidate found. All candidates still require numerous departures from an NFL implementation. The search does not support calling M3 a one- or two-bug NFL implementation.

Use the conservative, reproducible counts below: A = **12**, B = **11**, C = **10**, F = **9** edited code sites relative to the supplied baseline. These counts deliberately separate sign, missing-game default, routing, placement, and restart. They are **not architecture-independent lower bounds**. In an implementation that already shares an aggregate helper in division reduction, G below is a design choice rather than another defect: A/B become 11/10. If a correct lazy queue/cache already exists, Q can likewise be free. If a newly reused helper naturally defaults to .500, N can be free. Reported counts retain those sites so the search never hides added behavior inside an “inverted H2H” switch. Conversely, a malformed list constant can encode several semantic mistakes; counting X as one is generous to that model.

The three partial-season groups were supplied with this task and repeatedly consulted. Their reported scores are **diagnostics on a previously held-out set**, not blind new predictions. None of the recommended models reaches SOV/SOS or another incomplete-schedule statistic in those groups.

## Baseline and validation

`engine.py` contains a division standings routine (`division_order`), two-club comparator (`two_cmp`), multi-club resolution (`rank` / `_rank`), division reduction (`reduce`), wild-card record bands and restart/selection (`order`), and winner seeding (`seeds`). Defaults are NFL behavior. It imports only the read-only `Lg` statistical primitives and `Model.step` metric evaluations from `sim.py`; the control flow and defect switches are new.

Results:

- Madden: **19/34**, and the **same seven seeds in all 34 conferences** as `sim.py`'s NFL config, not merely the same score.
- Real NFL CSVs: **12/12 conferences in 2020–2025**, no mismatches, including all 84 seed positions.
- Partial season: **2/3**; NFL puts LAR ahead of ATL in the division-winner group.
- No tested baseline tie reaches the unavailable net-touchdown or coin-toss stage. Those cannot be recovered from final scores alone. The engine logs `UNRESOLVED` and uses alphabetical fallback if all available metrics tie; **zero such baseline fallbacks occurred**, including below playoff places. Thus the validation does not certify unobserved late-tiebreak behavior.
- The NFL two-club wild-card list must give way to division standing when both clubs belong to the same division. Omitting this initially reversed LA/SF in the real 2025 NFC; the final baseline handles this path and has no mismatch.
- `verify.py` checks 500 reproducibly sampled configurations against the full seeding evaluator. The accelerated evaluator uses observed division winners only after checking that the candidate actually selects them. It preserves the two MSS-2027 candidate seed orders as complete alternatives.

The official NFL procedure was checked against [NFL tiebreaking procedures](https://www.nfl.com/standings/tie-breaking-procedures), especially division reduction, one-club selection and restart. No source quotes are needed to interpret the locally supplied observations.

## Search and ranking

<!-- SEARCH_RESULTS -->

Exhaustive small-site search: **73,112 configurations**, all at most four charged sites. Best training fits by site count: {'0': 19, '1': 24, '2': 24, '3': 26, '4': 26}. Larger factorial: **403,200 configurations**. Focused extension: **4,608 configurations**. These search counts overlap; do not sum them as distinct implementations. Every candidate in the two factorial passes is scored on all 34 conferences and all three partial groups; the focused pass also scores all of its candidates on both datasets. Full JSON results and logs retain score distributions, top configurations, exact failures, and timing.
<!-- END_SEARCH_RESULTS -->

The search is exhaustive **inside the declared finite grammar**, not over all possible game code. A structural switch and a comparator-sign switch count separately. Direction's quantity, sign, and missing-game default each count separately when changed. The `winner_to_eliminated` and `both_drop` switches are distinct source mistakes with the same resulting partition; they are intentionally tested separately. Cached, subgroup/pair, whole-group comparator reduction, and whole-group shared-aggregate comparator reduction are all implemented.

`standings` sort initialization is operationally defined as overall percentage, conference percentage, division percentage, then Madden index. Actual internal final standings order is not available. `stable` uses Python's stable comparator sort; `unstable` uses ordinary in-place selection sort. These two algorithms do not exhaust every implementation of an unstable sort. No weekly sorting or stale-week data is used.

The larger factorial includes all combinations of its declared routing, direction/default, sweep, scope, vacuity, restart, cutoff, tail, and reducer choices, even when more than four sites change. `focused.py` additionally exhausts 4,608 subsets/variants around the M3-like path, including lazy caching. The small-site search includes lazy caching, including its low-cost sorting combinations; the larger factorial excludes it. Higher-cost cache models are covered by the focused extension.

Ranking below uses **U = conference fits + partial-group fits − 0.5 × site count − 0.25 × naturalness surcharge**. The surcharge disfavors the arbitrary common-first list, whole-group comparator reduction, unneeded raw-count fields, and a sign bug in a sort adapter. This is a transparent tradeoff, not a likelihood or evidence ratio. The held scores enter this descriptive ranking, so it must not be called held-out model selection. Exact configurations and all failures are in the JSON files.

<!-- RANK_TABLE -->

| Rank | Fit | Partial | Sites | U | Defects / exact nondefault settings | Failing conferences |
|---:|---:|---:|---:|---:|---|---|
| 1 | 34/34 | 3/3 | 12 | 31.00 | reuse=1; direction=pct_reverse_half; sweep=missing_winner; sweep_scope=all; reduction=lazy; reduce_tail=conf_first; placement=after_sweep; restart=tier; cutoff=reorder; multi=aggregate | none |
| 2 | 32/34 | 3/3 | 9 | 30.50 | reuse=1; direction=losses_normal_half; sweep=missing_winner; sweep_scope=all; placement=none; restart=tier; cutoff=eliminate; multi=aggregate | SFL-2026 AFC, MMGA6-2027 AFC |
| 3 | 32/34 | 3/3 | 9 | 30.50 | reuse=1; direction=opponent_normal_half; sweep=missing_winner; sweep_scope=all; placement=none; restart=tier; cutoff=eliminate; multi=aggregate | DM2-2027 NFC, SFL-2026 AFC |
| 4 | 32/34 | 3/3 | 9 | 30.50 | reuse=1; direction=opponent_normal_half; sweep=missing_winner; sweep_scope=all; placement=after_h2h; restart=tier; cutoff=reorder; multi=aggregate | DM2-2027 NFC, SFL-2026 AFC |
| 5 | 32/34 | 3/3 | 9 | 30.50 | reuse=1; direction=opponent_normal_half; sweep=missing_winner; sweep_scope=all; placement=after_h2h; restart=tier_noreduce; cutoff=reorder; multi=aggregate | DM2-2027 NFC, SFL-2026 AFC |
| 6 | 34/34 | 2/3 | 11 | 30.50 | reuse=1; direction=pct_reverse_half; sweep=missing_winner; reduction=lazy; reduce_tail=conf_first; placement=after_sweep; restart=tier; cutoff=reorder; multi=aggregate | none |
| 7 | 34/34 | 2/3 | 11 | 30.50 | reuse=1; direction=pct_reverse_half; sweep=missing_winner; sweep_scope=all; reduction=lazy; reduce_tail=conf_first; restart=tier; cutoff=reorder; multi=aggregate | none |
| 8 | 33/34 | 3/3 | 11 | 30.50 | reuse=1; direction=losses_normal_half; sweep=missing_winner; sweep_scope=all; vacuous=1; reduction=aggregate; placement=after_sweep; restart=tier; cutoff=eliminate; multi=aggregate | DM2-2027 NFC |
| 9 | 33/34 | 3/3 | 11 | 30.50 | reuse=1; direction=losses_normal_half; sweep=missing_winner; sweep_scope=all; vacuous=1; reduction=aggregate; placement=after_sweep; restart=tier_noreduce; cutoff=eliminate; multi=aggregate | DM2-2027 NFC |
| 10 | 33/34 | 3/3 | 11 | 30.50 | reuse=1; direction=opponent_normal_half; sweep=missing_winner; sweep_scope=all; vacuous=1; reduction=aggregate; placement=after_sweep; restart=tier; cutoff=eliminate; multi=aggregate | DM2-2027 NFC |
| 11 | 33/34 | 3/3 | 11 | 30.50 | reuse=1; direction=opponent_normal_half; sweep=missing_winner; sweep_scope=all; vacuous=1; reduction=aggregate; placement=after_sweep; restart=tier_noreduce; cutoff=eliminate; multi=aggregate | DM2-2027 NFC |
| 12 | 33/34 | 3/3 | 11 | 30.50 | reuse=1; direction=losses_normal_half; sweep=missing_winner; sweep_scope=all; reduction=aggregate; reduce_tail=conf_first; placement=after_sweep; restart=tier; cutoff=reorder; multi=aggregate | SFL-2026 AFC |
| 13 | 33/34 | 3/3 | 11 | 30.50 | reuse=1; direction=losses_normal_half; sweep=missing_winner; sweep_scope=all; reduction=aggregate; reduce_tail=conf_first; placement=after_sweep; restart=tier_noreduce; cutoff=reorder; multi=aggregate | SFL-2026 AFC |
| 14 | 33/34 | 3/3 | 11 | 30.50 | reuse=1; direction=losses_normal_half; sweep=missing_winner; sweep_scope=all; vacuous=1; reduction=aggregate; placement=after_sweep; restart=tier; cutoff=reorder; multi=aggregate | DM2-2027 NFC |
| 15 | 33/34 | 3/3 | 11 | 30.50 | reuse=1; direction=losses_normal_half; sweep=missing_winner; sweep_scope=all; vacuous=1; reduction=aggregate; placement=after_sweep; restart=tier_noreduce; cutoff=reorder; multi=aggregate | DM2-2027 NFC |

Mathematically equivalent opponent-percentage/sign encodings and identical both-drop/wrong-append outputs are collapsed for this table. Inferior inactive reducer settings are also collapsed. Sorting index, alphabetical and standings initializations remain distinct when the comparator is non-transitive.
<!-- END_RANK_TABLE -->

## Concrete defects and alternatives

Each block describes a concrete implementation site, with three to six pseudocode lines. Alternatives within a block are mutually exclusive. Normal metric lists are specified in the next section.

**R — D-reuse, wrong two-club list (one site).**

```text
compareTwo(a, b, context):
    steps = DIVISION_TWO                 # should depend on context
    return firstSeparatingMetric(a, b, steps)
```

The correctly separate `afterReduction` entry still uses WC_TWO. This matters: this is a reused top-level comparator, not inverted H2H in every two-team tie.

**I / quantity — D-dir, sign or record-field error (each changed site charged).**

```text
records = gamesAgainst(tiedGroup)
value = wins / played                    # variants: wins, losses, wins-losses
tiers = partitionDescending(-value)       # normal baseline: +value
```

```text
records = gamesAgainst(tiedGroup)
value = opponentWins / played            # own/opponent perspective mix-up
tiers = partitionDescending(value)
```

Opponent perspective and negative win percentage are equivalent when every club has a record, including half-win ties. Raw wins, losses, and net wins differ when clubs played different numbers of group games. Both comparator directions are tested for every quantity; “losses descending” is a wrong-direction candidate even without an extra sign negation.

**N — D-dir missing-game default (one site).**

```text
if played == 0:
    value = 0.5                          # alternatives: 0, 1
else: value = wins / played
# Baseline skips the whole aggregate step if any record is unavailable.
```

**H — insert the division H2H aggregate into the cross-division multi routine (one site).**

```text
steps = [SWEEP] + WILD_CARD_TAIL
steps.insert(1, DIVISION_GROUP_H2H)        # copied from division handling
return resolveBySteps(group, steps)
```

**D-sweep — correct branch, missing winner, both drop, wrong append, or aggregate replacement.**

```text
if exactlyOne(beatEveryOpponent): return [winner, rest]
if exactlyOne(lostToEveryOpponent): return [rest, loser]
return noSplit
```

```text
# Missing winner branch, L: one site.
if exactlyOne(lostToEveryOpponent): return [rest, loser]
return noSplit
```

```text
# Both outcomes eliminate: one site.
out = sweepWinners + sweepLosers
if out and out != group: return [group - out, out]
return noSplit
```

```text
# Wrong append target: distinct code mistake, same outputs as above.
if sweepWinner: eliminated.append(sweepWinner)  # should be advanced
if sweepLoser: eliminated.append(sweepLoser)
return [group - eliminated, eliminated] if properSplit else noSplit
```

```text
# Sweep replaced by H2H percentage: one site.
records = gamesAgainst(group)
if anyRecordMissing: return noSplit
return partitionDescending(winPercentage(records))
```

**V — vacuous sweep over unplayed opponents (one site, independently combined with missing winner).**

```text
lostAll = all(result != WIN for result in playedGroupGames)
beatAll = all(result != LOSS for result in playedGroupGames)
# Omitted: verify a meeting with each other club; empty filters pass all().
```

The separately tested strict alternative requires every meeting against every opponent to have the relevant result; the baseline follows the supplied engine's “at least one win/loss against each other club” test. Strict and vacuous are not interchangeable.

**S — sweep in division ties too (one scope site).**

```text
if group.size >= 3:
    applySweep(group)                     # omitted context != DIVISION guard
    applyRemainingContextSteps(group)
```

**D-reduce — representative selection.**

```text
# Correct precomputed division standing.
for division in group.divisions:
    keep += firstMember(divisionOrder[division], group)
return keep
```

```text
# Subgroup/pair ranking instead of saved division standing.
for division in group.divisions:
    keep += rankDivision(group.inDivision(division))[0]
return keep
```

```text
# G: shared group helper, even for a same-division pair.
for division in group.divisions:
    tier = bestTier(sharedAggregate(group.inDivision(division)))
    keep += resolveRemainingDivisionSteps(tier)[0]
return keep
```

```text
# Whole-group comparator, then first per division.
ordered = comparatorSort(group)           # normal or shared aggregate comparator
seen = set()
return [t for t in ordered if insertIfNew(seen, t.division)]
```

**F — reduction fallback step order (one list site).**

```text
if sharedAggregateDoesNotSeparate:
    steps = [DIV, CONF, COMMON, SOV, SOS, NET]
    return firstSeparatingStep(subgroup, steps)  # DIV, COMMON, CONF is baseline
```

**P / Z — reduction placement or omission (one site).**

```text
steps = [SWEEP, REDUCE, AGGREGATE] + tail  # baseline: REDUCE, SWEEP, tail
# Alternatives: REDUCE first; after AGGREGATE; omit REDUCE entirely (Z).
return resolveBySteps(group, steps)
```

**T — D-restart, tiered resolution instead of choosing one (one site).**

```text
for tier in firstSeparatingStep(group):
    output += rank(tier, restartAtStep=0)
return output                             # instead of pick one, restart original residual
```

```text
# Continue down the same list without restarting.
for tier in firstSeparatingStep(group):
    output += resolveBySteps(tier, originalSteps, nextStepIndex)
return output
```

The baseline picks one winner, removes only it from the original group, and restarts. `pick_noreduce` / `tier_noreduce` carry a `reductionDone` flag across calls, omitting later reductions; the ordinary `pick` / `tier` paths rerun reduction. A restart always switches to the two-club list when appropriate, except the deliberately faulty `continue` path, which retains the original step list.

**K — D-cutoff, select then order (one site).**

```text
ranked = rank(allTied, WC)
qualified = ranked[:openSlots]
return rank(qualified, WC)                 # baseline returns qualified directly
```

```text
# Alternative: no dedicated selected-subset reorder rule.
while group.size > openSlots:
    group.remove(rank(group, WC).last)
return rank(group, WC)                     # ordering naturally follows elimination restarts
```

The second variant is tested as `eliminate`; it can change membership, not just ordering. It is not automatically equivalent to K.

**D-sort — substitute pairwise sort for multi-club procedure; sign adapter separate.**

```text
initial = indexOrder | standingsOrder | alphabetical
compare = twoClubComparator(context)
return stableSort(initial, compare)       # alternatively unstable selection sort
```

```text
if decidingMetric == H2H:
    return -normalComparatorSign          # alternatively reverse every deciding metric
return normalComparatorSign
```

A cycle such as A beats B, B beats C, C beats A makes a pairwise H2H comparator non-transitive. Stability only constrains equal comparisons; it cannot repair such a cycle. Sorting and its sign mutation are counted separately.

**X — common-first multi tail (one malformed-list site).**

```text
if group.size >= 3:
    tail = [COMMON_NO_MINIMUM, CONF, DIV, SOV, SOS, RANKC, RANKA, NETCOMMON, NET]
    return sweepAndAggregateThen(group, tail)
```

**Q — lazy normal-order cache consumed by shared reduction (one additional routing/cache site).**

```text
afterSelectingWildCard(t):
    normalQueue.setdefault(t.division, fullDivisionStanding(t.division))
reduceDivision(subgroup):
    if normalQueue.contains(subgroup.division): return firstPresent(normalQueue, subgroup)
    return sharedAggregateReducer(subgroup)  # key/path does not distinguish comparator policy
```

Q replaces M3's explicit exception with cache availability. Here 'normal queue' refers to the ordinary two-club path used for BAL/PIT; a queue built by this engine can still inherit multi-club defects when a division has three tied clubs. Correct caching plus a correct reducer is harmless here; a faulty shared reducer exposes the inconsistent paths. This is why Q's interpretation as an independent defect is architecture-dependent.

## Complete algorithms for the three recommended implementations

The following shared primitives are fully specified; all later blocks use these exact primitives.

```text
DIV2 = [normal pair H2H, DIV, COMMON(no minimum), CONF, SOV, SOS,
        combined point rankings in conference, combined point rankings overall,
        NETCOMMON, NETALL]
WC2  = [normal pair H2H, CONF, COMMON(minimum 4), SOV, SOS,
        combined point rankings in conference, combined point rankings overall,
        NETCONF, NETALL]
DIVTAIL = [DIV, COMMON(no minimum), CONF, SOV, SOS, RANKC, RANKA, NETCOMMON, NETALL]
WCTAIL  = [CONF, COMMON(minimum 4), SOV, SOS, RANKC, RANKA, NETCONF, NETALL]
XTAIL   = [COMMON(no minimum), CONF, DIV, SOV, SOS, RANKC, RANKA, NETCOMMON, NETALL]
Two(G, context): use WC2 only in AFTER_REDUCTION; otherwise DIV2.
Inv(G): partition ascending by own H2H win percentage against G; no games = .500.
Loser(G): singleton club with at least one loss to EACH other club, or none.
Finish(G, steps): first separating metric partitions into tiers; rank each tier afresh.
DivStandings(D): group by overall percentage descending; rank each band as DIVISION.
SeedWinners(W): group W by overall percentage descending; rank each band as WINNERS.
QualifyAndOrder(G,k): rank G as WC; take first k; rank that subset as WC afresh.
```

For B and A, reducer fallback F is exactly `[DIV, CONF, COMMON(no minimum), SOV, SOS, NET]`, with normal direction after the inverted H2H shortcut. This reduction fallback has no bearing on ordinary two-club ties. Empty/nonseparating metrics advance to the next step. An after-reduction context persists into its tiers, so its two-club descendants use WC2.

### B-shared — 33/34, 3/3; 11 sites

```text
RankB(G, context):
    if size <= 1: return G
    if size == 2: return Two(G, context)
    if Loser(G) exists:
        return RankB(G - loser, context) + [loser]
    if context == WC:
        keep = []
        for division subgroup S in G:
            tier = first Inv(S), or S if no separation
            keep += first resolved by normal [DIV,CONF,COMMON,SOV,SOS,NET] in tier
        if keep differs from G:
            return RankB(keep, AFTER_REDUCTION) + RankB(G - keep, WC)
    tiers = Inv(G)
    if tiers separate: return concatenate RankB(tier, context) for each tier
    tail = DIVTAIL if context == DIVISION else WCTAIL
    for step in tail:
        tiers = partition by step
        if tiers separate: return concatenate RankB(tier, context) for each tier
    return unresolved late tiebreak

SeedsB(conference):
    W = first in DivStandings(D), for every division D
    winners = SeedWinners(W)
    wildCards = []
    for overall-record band G in nonwinners, descending:
        k = 3 - wildCards.size
        if k == 0: break
        wildCards += RankB(G, WC) if G.size <= k else QualifyAndOrder(G,k)
    return winners + wildCards
```

A singleton division subgroup is kept directly. In a same-division two-club WC tie, DIV2 is appropriate both under R and the NFL special case.

**Miss:** SFL-2026 AFC, predicted `NE CIN LV IND CLE BUF PIT`, observed `NE CIN LV IND CLE KC BAL`. Inverting the North pair keeps PIT, while inverting the West pair keeps KC. Group H2H then selects BUF/PIT. Neither restart alone nor a normal direct comparison of the survivors recovers the observed BAL membership.

**Plausibility:** The reused two-club list, shared aggregate sign, and tier-sort misconception are credible individual mistakes. Their conjunction with missing sweep-winner handling, changed reducer fallback, changed placement and a selected-subset rerank is much less parsimonious. B saves two sites versus the M3 proxy: the exception and X.

### A-cache — 34/34, 3/3; 12 sites

```text
RankA(G, context):
    if size <= 1: return G
    if size == 2: return Two(G, context)
    if Loser(G) exists:
        return RankA(G - loser, context) + [loser]
    if context == WC:
        keep = []
        for division subgroup S in G:
            if normalQueue contains S.division:
                keep += first member of S in normalQueue[S.division]
            else:
                tier = first Inv(S), or S if no separation
                keep += first resolved by normal [DIV,CONF,COMMON,SOV,SOS,NET] in tier
        if keep differs from G:
            return RankA(keep, AFTER_REDUCTION) + RankA(G - keep, WC)
    if Inv(G) separates: return concatenate RankA(tier, context) for each Inv tier
    tail = DIVTAIL if context == DIVISION else WCTAIL
    for step in tail:
        if partition(step,G) separates: return concatenate RankA(tier,context)
    return unresolved late tiebreak

SeedsA(conference):
    normalQueue = empty
    W = first in DivStandings(D), for every division D
    winners = SeedWinners(W)
    wildCards = []
    for overall-record band G in nonwinners, descending:
        k = 3 - wildCards.size
        if k == 0: break
        selected = RankA(G,WC) if G.size <= k else RankA(RankA(G,WC)[:k],WC)
        wildCards += selected
        for selected t:
            normalQueue.setdefault(t.division, DivStandings(t.division))
    return winners + wildCards
```

**Misses:** none of the 34 conferences or three partial groups. The smaller 10-site A variant already fits 34/34 but only 1/3 partial groups; the sweep scope and placement are needed to repair the other two partial groups.

**Plausibility:** Lazy per-division candidate queues are ordinary game UI/backend machinery. This baseline already computes division standings to choose winners, so A specifically needs a separate lazy wild-card queue/cache rather than simply consuming the always-available standings cache. That extra lifecycle is a substantial weakness in its plausibility argument. Looking in a saved normal order before recomputing a subgroup is plausible. But the data supplies no evidence for this cache lifecycle; it was constructed after observing the single exception. Count it as a weaker causal claim than the raw perfect fit suggests. It saves X versus M3, not a demonstrated large reduction in bugs.

### C-no-reduction — 32/34, 3/3; 10 sites

```text
RankC(G, context):
    if size <= 1: return G
    if size == 2: return Two(G, context)
    if Loser(G) exists:
        return RankC(G - loser, context) + [loser]
    tiers = Inv(G)
    if tiers separate: return concatenate RankC(tier, context) for each tier
    for step in XTAIL:
        tiers = partition by step
        if tiers separate: return concatenate RankC(tier, context) for each tier
    return unresolved late tiebreak

SeedsC(conference):
    W = first in DivStandings(D), for every division D
    winners = SeedWinners(W)
    wildCards = []
    for overall-record band G in nonwinners, descending:
        k = 3 - wildCards.size
        if k == 0: break
        r = RankC(G, WC)
        wildCards += r if G.size <= k else RankC(r[:k], WC)
    return winners + wildCards
```

**Miss 1:** DM2-2027 NFC, predicted `LAR MIN NYG TB AZ ATL DET`, observed `LAR MIN NYG TB AZ ATL PHI`. With one place left, the group is DET/PHI/WAS, all 8–9. PHI beat DET; PHI/WAS split. DET's .000 group percentage wins the inverted aggregate. B first reduces the East pair; their division records tie, then PHI's 7–5 conference record beats WAS's 6–6. PHI then beats DET under normal two-club H2H. Thus this miss is genuine missing division reduction, not a final ordering error.

**Miss 2:** SFL-2026 AFC, predicted `NE CIN LV IND CLE KC PIT`, observed `NE CIN LV IND CLE KC BAL`. Removing reduction allows the .000-group-H2H PIT into the selected set; the final normal two-club seeding comparator puts KC ahead of PIT. It cannot turn PIT into BAL.

**Plausibility:** Forgetting reduction is simpler than inventing an inverted special reducer and a cache exception. C loses the reducer fallback, reducer routing and exception machinery, but retains X. X is a weakly motivated constant, so the net naturalness gain is modest. The official-tail version scores 31/34, missing SIMFULL NFC as well.

## F-loss-elimination: the nine-site alternative

F has **32/34 conferences, 3/3 partial groups, nine sites**: R, wrong H2H field (`losses` instead of percentage), N (.500 for no group games), L, S, H, Z (no reduction), T, and repeated bottom elimination at a cutoff. It uses official multi tails, not X, and does not use the special reduction fallback F-label described earlier. The identical letter in the model name is just a model identifier.

```text
RankLoss(G, context):
    if size <= 1: return G
    if size == 2: use DIV2 (WC2 only if after reduction, which this model never enters)
    if exactly one club lost to each other club: rank the rest afresh, append loser
    partition by group losses DESCENDING, default .500 if no group games
    if separated: rank each tier afresh, concatenate
    otherwise use DIVTAIL for division ties, WCTAIL for cross-division ties
    at the first separating tail metric, rank each tier afresh and concatenate
SeedLoss(conference):
    compute division standings by record bands and RankLoss; take winners
    order winners by record bands and RankLoss
    for nonwinner record bands in descending order:
        if the whole band fits the open wild-card places: append RankLoss(band,WC)
        otherwise:
            while more clubs than open places: remove RankLoss(current,WC).last
            append RankLoss(survivors,WC)
    return four winners plus three wild cards
```

**SFL miss:** KC/PIT instead of KC/BAL, as in C: the raw-loss routine initially favors PIT's three group losses, and no reduction or normal cached North queue removes it. The two-club final order puts KC ahead.

**MMGA6-2027 AFC miss:** predicted wild cards CIN/BUF/NYJ, observed CIN/HOU/LV. CIN is alone at 10–7. BUF/NYJ/HOU/LV are 9–8 for two remaining places. BUF and NYJ split their two meetings; both beat HOU once; LV played none of the other three. Initial group losses are HOU 2, BUF 1, NYJ 1, LV .500. Raw-loss order makes LV last, so the elimination loop removes LV. On the next restart HOU has lost to both remaining clubs and the strict sweep-loser guard now removes HOU. BUF/NYJ qualify. This is a consequential interaction between wrong field, no-games default, and repeated elimination, not a simple last-two ordering mistake.

**Plausibility:** reading `losses` where `winPercentage` was intended is an ordinary field error; eliminating clubs until enough remain is ordinary selection code. This removes more special machinery than C or M3. However, the no-games value .500 is dimensionally odd for a raw loss count: it is credible only as a retained sentinel from a percentage-oriented helper. The sweep scope, two-list reuse, aggregate insertion, and tier resolution remain independent assumptions. Nine sites is still not a tiny bug explanation.

**For the actual top three ranked implementations**, use the five-team SFL-shaped scenario above. Their final two wild cards are A-cache: **KC/BAL**; F-loss-elimination: **KC/PIT**; percentage/opponent-record elimination with no reduction: **BUF/PIT**. Thus that one fully specified graph distinguishes all three. The percentage elimination variant misses DM2 (DET instead of PHI) and SFL (BUF/PIT instead of KC/BAL). Unlike F, it retains the inverted-percentage field and only changes the elimination semantics.

## SFL-2026 AFC, step by step

All three models have division winners **NE 15–2, CIN 13–4, LV 11–6, IND 9–8**, seeded in that order. CLE 12–5 is WC #5. Five teams tie at 10–7 for two places:

| Team | Division | Division record | Conference record | Games against the five-team group |
|---|---|---:|---:|---|
| BAL | North | 3–3 | 9–3 | beat PIT twice; beat BUF |
| PIT | North | 2–4 | 6–6 | lost to BAL twice; lost to DEN |
| DEN | West | 6–0 | 9–3 | beat KC twice; beat PIT; lost to BUF |
| KC | West | 4–2 | 8–4 | lost to DEN twice; beat BUF |
| BUF | East | 4–2 | 7–5 | beat DEN; lost to BAL and KC |

All unlisted meetings in this group did not occur. No club lost to **every** other member, so the strict loser guard does nothing.

**B:** reduce North to PIT (inverted 0–2 vs BAL); West to KC (inverted 0–2 vs DEN). Survivors BUF/KC/PIT have percentages 0, 1, .500 respectively: PIT played neither of the others. Inverted tiers are BUF, PIT, KC. Select BUF/PIT, then normal two-club seeding uses division record, BUF 4–2 over PIT 2–4. Output #6 BUF, #7 PIT.

**A:** selecting CLE in the earlier record band populated the normal North queue; normal H2H puts BAL above PIT. The West queue is absent, so shared reduction keeps KC over DEN. Survivors BAL/BUF/KC have group percentages 1, 0, 1. BUF lost to both other clubs and is eliminated by the strict guard. AFTER_REDUCTION uses WC2: BAL's 9–3 conference record beats KC's 8–4. The qualifying set is BAL/KC. The selected-subset top-level rerank uses DIV2: KC's 4–2 division record beats BAL's 3–3. Output #6 KC, #7 BAL. The apparent exception is thus a **cached normal North path versus recomputed inverted West path**, followed by two distinct comparator entry points.

**C:** without reduction, group percentages are BAL 1, PIT 0, DEN .750, KC .333, BUF .333. PIT advances first; KC beats BUF on normal two-club H2H within their tied tier. Select PIT/KC. Normal two-club seeding gives KC's 4–2 division record priority over PIT's 2–4. Output #6 KC, #7 PIT.

**Vacuous alternative D:** before reduction, PIT has no wins in its played group games, so it is eliminated despite not meeting BUF/KC. North then contains only BAL. The remainder follows A's BAL/KC path. This removes the cache hypothesis but creates DM2's error: DET lost to PHI and did not play WAS, so a vacuous loser guard drops DET prematurely. PHI/WAS then enter ordinary DIV2; their common-game records favor WAS. D gives WAS the last place instead of PHI. D is 33/34, 3/3, 12 sites. A blanket vacuous sweep is therefore not a full explanation.

## Explicit answers

**(a) Can one defect invert same-division reduction and multi ranking?** Yes: one reversed sign (or one opponent-perspective record) in a shared **group** H2H helper affects both its multi-team callers and a reducer that invokes it on a two-team subgroup. The dedicated ordinary two-club comparator can remain correct. This is a concrete call-graph explanation, not two independent sign mistakes. However, aggregate application in cross-division multi ties and the reducer's routing must also be explained. No single-site candidate in the fixed NFL baseline explains the whole data: the best single-site fit is only 24/34. “One shared sign explains these two local inversions” is much weaker than “one defect explains Madden.”

**(b) Can the SFL exception emerge from control flow?** Yes, constructively via A's cache paths above, with 34/34 and 3/3. A vacuous loser check also produces its desired conference output, but misses DM2. Neither mechanism is identified by the observations. There is no evidence yet that a game-developer cache uses this exact lifecycle.

**(c) Why dropped sweep winners and losers?** B/A/C implement a **strict sweep-loser guard**, followed by **ascending group win percentage**. An actual loser is removed before it can benefit from inversion; an actual winner is left to receive the worst aggregate value. UFL-2026 CLE also loses its division reduction to CIN in B/A. SML-2026 DET and DM2-2027 TB reach the inverted multi step and rank last. This accounts for the asymmetry without changing H2H direction by team. There is also a single wrong-list mechanism for both: append sweep winners and losers to `eliminated`. Both-drop and missing-winner models often have identical observed outputs, since the inverted aggregate already sinks a winner. The search includes both; such equivalence prevents identifying which branch Madden has. A global reversal alone cannot eliminate genuine sweep losers: it would promote them.

**(d) Is there a simpler 32–33/34 implementation than M3?** Yes in a modest, countable sense: B is 33/34, 3/3, 11 sites versus 13 for an equivalent M3 proxy with its explicit exception; C is 32/34, 3/3, 10 sites. B deletes the exception and X, and misses only SFL. C additionally deletes special reducer behavior; its missing reduction causes the DM2 miss, and PIT's inverted aggregate causes the SFL miss. F is smaller again: 32/34, 3/3 at nine sites, four fewer than the M3 proxy. Its two misses are diagnosed in the next subsection. These are cleaner approximations, not a discovery of a small-bug NFL engine. The best three-site pairwise-sort model is only 26/34 and 0/3; the exhaustive four-site grammar does not reach 32/34.

## Restart and cutoff findings

`details.json` contains the full 5 × 3 restart/cutoff table for A/B/C. For B:

| Restart | Take first k | Explicit selected-subset order | Repeatedly remove last, then order |
|---|---:|---:|---:|
| Pick one, restart | 26/34, 3/3 | 27/34, 3/3 | 26/34, 3/3 |
| Tiered, restart each tier | 31/34, 3/3 | **33/34, 3/3** | 32/34, 3/3 |
| Continue original steps | 27/34, 2/3 | 32/34, 2/3 | 31/34, 2/3 |

Suppressing repeated reduction gives the same scores as rerunning it on this B path. It is not identified by these observations. Repeated elimination is an actual example where a selected-subset rerank arises from control flow rather than a bespoke cutoff rule, but here it introduces a SIMFULL NFC miss. None of these tested restart alternatives recovers B's 33/34 while deleting the cutoff behavior. Across the larger factorial, however, a vacuous loser guard plus repeated bottom elimination reaches **33/34, 3/3 with 11 sites**, missing DM2-2027 NFC (WAS instead of PHI). It drops the special reducer fallback F while changing the cutoff mechanism. Thus selected-subset ordering can emerge from elimination control flow at comparable total fit, but this is a different implementation with a different miss; it does not derive the full M3 outputs for free.

## Distinguishing future scenarios

### Scenario 1: all three predict different wild cards

Use the SFL-shaped five-team graph above in a future season, with one higher-record wild card from North, two open places, and all five tied at 10–7. Division/conference records and every meeting are specified in the table; no later metric is reached. Then A predicts **KC/BAL**, B **BUF/PIT**, C **KC/PIT** for the last two seeds. These three outcomes distinguish the recommended implementations immediately.

For a **new full 17-game fixture with different team labels**, `scenarios.json` relabels the entire SFL season within divisions: BAL↔PIT, DEN↔KC, BUF↔NE, CLE↔CIN. It is synthetic, not another observation. Division winners are BUF/CLE/LV/IND; CIN 12–5 is the already-selected North wild card. PIT/BAL/KC/DEN/NE are the 10–7 group, respectively inheriting the five rows above. Every team's full schedule is in the file, so all secondary statistics are defined. Predicted last two seeds:

| A-cache | B-shared | C-no-reduction |
|---|---|---|
| DEN, PIT | NE, BAL | DEN, BAL |

For the literal top-three A/F/percentage-elimination models, this same full fixture predicts **DEN/PIT**, **DEN/BAL**, and **NE/BAL**, respectively. The fixture preserves the observed graph structure; it is a prospective repeat test, not independent validation or a newly discovered pattern.

### Scenario 2: reduction versus no reduction

Two higher-record wild cards have qualified. DET/PHI/WAS tie at 8–9 for one place. PHI beat DET once, PHI/WAS split 1–1, DET/WAS did not meet. PHI/WAS both have 3–3 division records, PHI 7–5 conference, WAS 6–6; DET is 7–5 in conference. Put the previously selected wild cards outside the East. A/B keep PHI over WAS by reducer F, then PHI beats DET normally. C's inverted aggregate instead selects DET. This tests reduction without requiring the five-club cache path.

### Scenario 3: a direct cache intervention

Repeat scenario 1, but put the already-selected higher-record wild card in an unrelated division instead of North; preserve the five tied clubs' records and meetings. A's North cache is now absent and it follows B: BUF/PIT. B remains BUF/PIT; C remains KC/PIT. Conversely, create a higher-record West wild card, rather than a North one: a normal cached West ordering should keep DEN over KC under A. This is a sharper cache test than merely replaying the original observed exception. The division winner must have a still better record, and the moved higher-record club's remaining results must be adjusted consistently when generating the full season; the partial pattern is the test specification, not an independently validated full fixture.

### Scenarios 4–5: distinguish additional 34/34 cache variants

Three A-cache variants are useful scope/order tests: A has sweep in every context and reduction after sweep; A-scope omits the division sweep; A-early reduces before sweeping. They fit the same 34 full conferences but differ on the supplied partial groups. The following fully specified tie patterns distinguish them without using incomplete opponent-season records:

| Pattern | A | A-scope | A-early |
|---|---|---|---|
| North title: GB/DET/CHI each 10–7; GB/DET split; both sweep CHI twice; GB/DET division records 5–1, CHI 2–4; GB/DET pair-common records 8–4 and 7–5 | GB | CHI | GB |
| Two WC places: DET/CHI/PHI each 10–7; DET sweeps CHI twice; PHI beats CHI once; DET/PHI do not meet; DET 5–1 and PHI 2–4 in division games; no earlier qualifying club in these two divisions | DET, PHI | DET, PHI | PHI, CHI |

In the title pattern, the omitted guard lets .000-H2H CHI win the inversion; with the guard, GB wins the remaining ordinary two-club comparison on common games. In the WC pattern, early inverted reduction keeps CHI over DET before its sweep-loss elimination is recognized. These are pattern replications of known partial observations, not fresh validation. A future season with the same pattern can retest the inferred scope and ordering independently.

## Re-running and limitations

From this directory, with Python 3 and no third-party dependencies:

```sh
python3 engine.py
python3 verify.py
python3 search.py
python3 search.py --extended
python3 focused.py
python3 details.py
python3 rank.py
```

All writes are confined to this directory. Repository input is opened read-only; bytecode generation for imported repository modules is disabled. No sibling workstream data or Week-17 stale-data hypothesis was used. The 2020–2025 check validates NFL output on these CSVs, not all possible schedules. Comparator initialization, unobserved late NFL metrics, cache lifecycle, and whether X is one literal mistake or several semantic errors remain unresolved. The main empirical gap is still a mechanism that fits broadly with only a handful of naturally connected coding errors.







## Resolved pseudocode for ranked entries 1–5

These use the common metric definitions above. This appendix gives the exact step lists and control flow for the actual five highest-ranked configurations, including simpler variants that miss partial groups. Their ranking is descriptive; A/B/F above are the principal working comparisons after considering fit, simplicity, and partial-group failures.

### Ranked entry 1: 34/34, 3/3, 12 sites

```text
div.TWO = H2H, DIV, COM, CONF, SOV, SOS, RANKC, RANKA, NETCOM, NET
div.MULTI = SWEEP, AGG, DIV, COM, CONF, SOV, SOS, RANKC, RANKA, NETCOM, NET
wc.TWO = H2H, DIV, COM, CONF, SOV, SOS, RANKC, RANKA, NETCOM, NET
wc.MULTI = SWEEP, REDUCE, AGG, CONF, COM4, SOV, SOS, RANKC, RANKA, NETCONF, NET
dw.TWO = H2H, DIV, COM, CONF, SOV, SOS, RANKC, RANKA, NETCOM, NET
dw.MULTI = SWEEP, AGG, CONF, COM4, SOV, SOS, RANKC, RANKA, NETCONF, NET
post.TWO = H2H, CONF, COM4, SOV, SOS, RANKC, RANKA, NETCONF, NET
post.MULTI = SWEEP, AGG, CONF, COM4, SOV, SOS, RANKC, RANKA, NETCONF, NET
AGG quantity/sign/no-games = pct_reverse_half
SWEEP = missing_winner; vacuous = False
REDUCE = lazy; subgroup fallback = conf_first
REDUCE uses saved normal division order if present, otherwise the shared AGG reducer.
Rank(G,ctx,start=0,done=false,override=none):
    if |G| <= 1: return G
    choose override, or ctx.TWO / ctx.MULTI according to current group size
    for each step from start:
        if step is REDUCE and done: continue
        T = apply the named step to G; if no separation: continue
        set child context to post for the first REDUCE tier, otherwise preserve ctx
        return concatenation of Rank(tier,childCtx,0,false)
    log unresolved late tiebreak; use deterministic alphabetical fallback
Seed(conference):
    group each division by overall percentage; Rank(each band,div); take title winners
    group title winners by overall percentage; Rank(each band,dw) to get seeds 1–4
    loop nonwinner record bands descending while fewer than three wild cards exist:
        r = Rank(band,wc); k = remaining wild-card places
        append Rank(r[:k],wc) at a cutoff; otherwise append r
        populate saved normal division orders for selected clubs after this record band
    return four winners plus three wild cards
```

No in-sample conference failures.

Plausibility: the cache is a constructive but unverified lifecycle hypothesis.

### Ranked entry 2: 32/34, 3/3, 9 sites

```text
div.TWO = H2H, DIV, COM, CONF, SOV, SOS, RANKC, RANKA, NETCOM, NET
div.MULTI = SWEEP, AGG, DIV, COM, CONF, SOV, SOS, RANKC, RANKA, NETCOM, NET
wc.TWO = H2H, DIV, COM, CONF, SOV, SOS, RANKC, RANKA, NETCOM, NET
wc.MULTI = SWEEP, AGG, CONF, COM4, SOV, SOS, RANKC, RANKA, NETCONF, NET
dw.TWO = H2H, DIV, COM, CONF, SOV, SOS, RANKC, RANKA, NETCOM, NET
dw.MULTI = SWEEP, AGG, CONF, COM4, SOV, SOS, RANKC, RANKA, NETCONF, NET
post.TWO = H2H, CONF, COM4, SOV, SOS, RANKC, RANKA, NETCONF, NET
post.MULTI = SWEEP, AGG, CONF, COM4, SOV, SOS, RANKC, RANKA, NETCONF, NET
AGG quantity/sign/no-games = losses_normal_half
SWEEP = missing_winner; vacuous = False
REDUCE = cached; subgroup fallback = official
Rank(G,ctx,start=0,done=false,override=none):
    if |G| <= 1: return G
    choose override, or ctx.TWO / ctx.MULTI according to current group size
    for each step from start:
        if step is REDUCE and done: continue
        T = apply the named step to G; if no separation: continue
        set child context to post for the first REDUCE tier, otherwise preserve ctx
        return concatenation of Rank(tier,childCtx,0,false)
    log unresolved late tiebreak; use deterministic alphabetical fallback
Seed(conference):
    group each division by overall percentage; Rank(each band,div); take title winners
    group title winners by overall percentage; Rank(each band,dw) to get seeds 1–4
    loop nonwinner record bands descending while fewer than three wild cards exist:
        r = Rank(band,wc); k = remaining wild-card places
        at cutoff remove Rank(current,wc).last repeatedly until k remain; rank survivors
    return four winners plus three wild cards
```

- SFL-2026 AFC: predicted `NE CIN LV IND CLE KC PIT`; expected `NE CIN LV IND CLE KC BAL`. The SFL control-flow diagnosis above applies.
- MMGA6-2027 AFC: predicted `IND LAC NE BAL CIN BUF NYJ`; expected `IND LAC NE BAL CIN HOU LV`. Repeated bottom elimination drops LV first; the next restart identifies HOU as a strict sweep loser and drops it. See the MMGA diagnosis above.

Plausibility: no division reduction and repeated bottom elimination are simple control flow; the retained .500 sentinel is awkward for a raw loss count.

### Ranked entry 3: 32/34, 3/3, 9 sites

```text
div.TWO = H2H, DIV, COM, CONF, SOV, SOS, RANKC, RANKA, NETCOM, NET
div.MULTI = SWEEP, AGG, DIV, COM, CONF, SOV, SOS, RANKC, RANKA, NETCOM, NET
wc.TWO = H2H, DIV, COM, CONF, SOV, SOS, RANKC, RANKA, NETCOM, NET
wc.MULTI = SWEEP, AGG, CONF, COM4, SOV, SOS, RANKC, RANKA, NETCONF, NET
dw.TWO = H2H, DIV, COM, CONF, SOV, SOS, RANKC, RANKA, NETCOM, NET
dw.MULTI = SWEEP, AGG, CONF, COM4, SOV, SOS, RANKC, RANKA, NETCONF, NET
post.TWO = H2H, CONF, COM4, SOV, SOS, RANKC, RANKA, NETCONF, NET
post.MULTI = SWEEP, AGG, CONF, COM4, SOV, SOS, RANKC, RANKA, NETCONF, NET
AGG quantity/sign/no-games = opponent_normal_half
SWEEP = missing_winner; vacuous = False
REDUCE = cached; subgroup fallback = official
Rank(G,ctx,start=0,done=false,override=none):
    if |G| <= 1: return G
    choose override, or ctx.TWO / ctx.MULTI according to current group size
    for each step from start:
        if step is REDUCE and done: continue
        T = apply the named step to G; if no separation: continue
        set child context to post for the first REDUCE tier, otherwise preserve ctx
        return concatenation of Rank(tier,childCtx,0,false)
    log unresolved late tiebreak; use deterministic alphabetical fallback
Seed(conference):
    group each division by overall percentage; Rank(each band,div); take title winners
    group title winners by overall percentage; Rank(each band,dw) to get seeds 1–4
    loop nonwinner record bands descending while fewer than three wild cards exist:
        r = Rank(band,wc); k = remaining wild-card places
        at cutoff remove Rank(current,wc).last repeatedly until k remain; rank survivors
    return four winners plus three wild cards
```

- DM2-2027 NFC: predicted `LAR MIN NYG TB AZ ATL DET`; expected `LAR MIN NYG TB AZ ATL PHI`. The DM2 reducer/vacuous-sweep/no-reduction diagnosis above applies.
- SFL-2026 AFC: predicted `NE CIN LV IND CLE BUF PIT`; expected `NE CIN LV IND CLE KC BAL`. The SFL control-flow diagnosis above applies.

Plausibility: removing reduction and eliminating from the bottom avoids a special selected-subset ordering rule, but still combines several independent mistakes.

### Ranked entry 4: 32/34, 3/3, 9 sites

```text
div.TWO = H2H, DIV, COM, CONF, SOV, SOS, RANKC, RANKA, NETCOM, NET
div.MULTI = SWEEP, AGG, DIV, COM, CONF, SOV, SOS, RANKC, RANKA, NETCOM, NET
wc.TWO = H2H, DIV, COM, CONF, SOV, SOS, RANKC, RANKA, NETCOM, NET
wc.MULTI = SWEEP, AGG, REDUCE, CONF, COM4, SOV, SOS, RANKC, RANKA, NETCONF, NET
dw.TWO = H2H, DIV, COM, CONF, SOV, SOS, RANKC, RANKA, NETCOM, NET
dw.MULTI = SWEEP, AGG, CONF, COM4, SOV, SOS, RANKC, RANKA, NETCONF, NET
post.TWO = H2H, CONF, COM4, SOV, SOS, RANKC, RANKA, NETCONF, NET
post.MULTI = SWEEP, AGG, CONF, COM4, SOV, SOS, RANKC, RANKA, NETCONF, NET
AGG quantity/sign/no-games = opponent_normal_half
SWEEP = missing_winner; vacuous = False
REDUCE = cached; subgroup fallback = official
Rank(G,ctx,start=0,done=false,override=none):
    if |G| <= 1: return G
    choose override, or ctx.TWO / ctx.MULTI according to current group size
    for each step from start:
        if step is REDUCE and done: continue
        T = apply the named step to G; if no separation: continue
        set child context to post for the first REDUCE tier, otherwise preserve ctx
        return concatenation of Rank(tier,childCtx,0,false)
    log unresolved late tiebreak; use deterministic alphabetical fallback
Seed(conference):
    group each division by overall percentage; Rank(each band,div); take title winners
    group title winners by overall percentage; Rank(each band,dw) to get seeds 1–4
    loop nonwinner record bands descending while fewer than three wild cards exist:
        r = Rank(band,wc); k = remaining wild-card places
        append Rank(r[:k],wc) at a cutoff; otherwise append r
    return four winners plus three wild cards
```

- DM2-2027 NFC: predicted `LAR MIN NYG TB AZ ATL DET`; expected `LAR MIN NYG TB AZ ATL PHI`. Inverted group ranking resolves before the late reduction call, keeping DET ahead of PHI.
- SFL-2026 AFC: predicted `NE CIN LV IND CLE KC PIT`; expected `NE CIN LV IND CLE KC BAL`. The SFL control-flow diagnosis above applies.

Plausibility: placing reduction after aggregate separation is a concrete moved-call error; it allows a result before the division constraint is applied.

### Ranked entry 5: 32/34, 3/3, 9 sites

```text
div.TWO = H2H, DIV, COM, CONF, SOV, SOS, RANKC, RANKA, NETCOM, NET
div.MULTI = SWEEP, AGG, DIV, COM, CONF, SOV, SOS, RANKC, RANKA, NETCOM, NET
wc.TWO = H2H, DIV, COM, CONF, SOV, SOS, RANKC, RANKA, NETCOM, NET
wc.MULTI = SWEEP, AGG, REDUCE, CONF, COM4, SOV, SOS, RANKC, RANKA, NETCONF, NET
dw.TWO = H2H, DIV, COM, CONF, SOV, SOS, RANKC, RANKA, NETCOM, NET
dw.MULTI = SWEEP, AGG, CONF, COM4, SOV, SOS, RANKC, RANKA, NETCONF, NET
post.TWO = H2H, CONF, COM4, SOV, SOS, RANKC, RANKA, NETCONF, NET
post.MULTI = SWEEP, AGG, CONF, COM4, SOV, SOS, RANKC, RANKA, NETCONF, NET
AGG quantity/sign/no-games = opponent_normal_half
SWEEP = missing_winner; vacuous = False
REDUCE = cached; subgroup fallback = official
Rank(G,ctx,start=0,done=false,override=none):
    if |G| <= 1: return G
    choose override, or ctx.TWO / ctx.MULTI according to current group size
    for each step from start:
        if step is REDUCE and done: continue
        T = apply the named step to G; if no separation: continue
        set child context to post for the first REDUCE tier, otherwise preserve ctx
        return concatenation of Rank(tier,childCtx,0,done OR step==REDUCE)
    log unresolved late tiebreak; use deterministic alphabetical fallback
Seed(conference):
    group each division by overall percentage; Rank(each band,div); take title winners
    group title winners by overall percentage; Rank(each band,dw) to get seeds 1–4
    loop nonwinner record bands descending while fewer than three wild cards exist:
        r = Rank(band,wc); k = remaining wild-card places
        append Rank(r[:k],wc) at a cutoff; otherwise append r
    return four winners plus three wild cards
```

- DM2-2027 NFC: predicted `LAR MIN NYG TB AZ ATL DET`; expected `LAR MIN NYG TB AZ ATL PHI`. Inverted group ranking resolves before the late reduction call, keeping DET ahead of PHI.
- SFL-2026 AFC: predicted `NE CIN LV IND CLE KC PIT`; expected `NE CIN LV IND CLE KC BAL`. The SFL control-flow diagnosis above applies.

Plausibility: placing reduction after aggregate separation is a concrete moved-call error; it allows a result before the division constraint is applied.

## M4

Implemented independently from `../M4.md` in `engine.py`: **34/34 conferences, 3/3 partial groups**, no division-queue cache or exception. `m4_independent_score.json` records the first score; `../m4.py` was never opened. D4 passes the original common-opponent set through every recursive split, including reduction; a new cutoff-subset ranking computes a fresh set. In DM2, DET's vacuous elimination leaves PHI/WAS with original common opponent CAR, both 1–0; conference record selects PHI. Recomputing pair-common opponents instead selects WAS.

**Site accounting:** the literal spec costs **14** under the previous conservative convention: R, I, N, H, L, V, S, G, P, T, K, D4, a division-style multi-tail list, and post-reduction DIV2 routing. The latter two are distinct from earlier B's official cross-division tail and WC2 post-reduction entry; they cannot silently be bundled into D4. Removing both gives **M4-lean: 34/34, 3/3, 12 sites**: the 11-site vacuous shared variant plus D4. Compare A-cache **12**, B-shared **11**, coordinator C-loss **10**. The older report's C-no-reduction is a different model, also charged 10; coordinator C-loss maps to `F-loss-elimination` here (the old local counter charges that encoding nine).

Under the previously stated shared-helper architecture, **G becomes free** because normal reduction already calls the aggregate helper: literal/lean M4 become **13/11**, while A/B become **11/10**. N can additionally be free if .500 is the helper's pre-existing no-game default; this is a separate architectural assumption. Sharing alone does not erase context routing, sweep placement/scope, tier restart, cutoff, or stale common-opponent scope.

**Mechanism/search:** D4 is the better working story: one prematurely computed opponent intersection survives recursion, rather than requiring a different ordering only for inner same-division pairs. Neither is established by fit. An exhaustive **80-variant one-field neighborhood**, holding the vacuous loser-only check and its scope fixed, found exactly two DM2 repairs: D4 and inner-pair H2H/DIV/CONF/COM; both are **34/34, 3/3**. No other tested quantity/sign/default, reducer, placement, restart, cutoff, tail, pairwise sort, or routing change repairs DM2. Direction alternatives include some multi-site encodings, so this search is broader than only single edited sites; it is not an unrestricted proof.

Re-run predictions (ordered remaining wild cards):

| Scenario | A-cache | B-shared | C-old | C-loss | M4 |
|---|---|---|---|---|---|
| 1: SFL pattern, prior North WC | KC/BAL | BUF/PIT | KC/PIT | KC/PIT | KC/BAL |
| 2: DM2 pattern, one slot | PHI | PHI | DET | PHI | PHI |
| 3: prior WC moved to South | BUF/PIT | BUF/PIT | KC/PIT | KC/PIT | KC/BAL |
| 3, West intervention | DEN/PIT | BUF/PIT | KC/PIT | KC/PIT | KC/BAL |

On the existing full relabeled fixture, M4's last two seeds are **DEN/PIT**, matching A. Scenario 3 remains a controlled cache-state intervention preserving tie statistics, not a regenerated complete season.

**Minimal separating fixture:** A/B/C occupy three different AFC divisions, are nonwinners tied 1–1 for one remaining place. Games: B beats A; A beats C; C beats NFC outsider X; X beats B. M4 selects **B**; M3 and A-cache select **C**. The two tied-group games form the minimal directed path: vacuous D2 drops C, then B wins normal pair H2H; strict loser checking instead reaches inverted group percentage. M3's exception is inapplicable with three distinct divisions.

A second fixture isolates D4: A/B/C tie 4–2 in three divisions; both A/B beat C, tie on division record, and beat their sole original common opponent X. Pair-common opponents C/X/Y favor A (3–0 versus 2–1), but conference record favors B (3–0 versus 2–1). M4 and M4-lean select **B**; M3, A-cache, and the inner-pair alternative select **A**. Thus this probe distinguishes the two perfect-fit stories as well. Complete games are in `m4_scenarios.json`.

Run `python3 -B m4_analysis.py` for scores, the grammar search, traces, scenarios, and regression assertions; `python3 -B verify.py` also passes baseline exactness, 12/12 real NFL conferences, and 500 accelerated/full equivalence checks. Results: `m4_results.json`, `m4_search.json`. Partial groups remain previously consulted diagnostics.
