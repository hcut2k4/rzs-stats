package com.rzs.stats.playoffs;

import java.util.*;
import java.util.function.Predicate;

import static com.rzs.stats.playoffs.TiebreakerRules.Step;

public final class PlayoffSeeding {
    public record Team(String abbr, String conference, String division) {
        public Team {
            if (abbr == null || abbr.isBlank() || conference == null || conference.isBlank()
                    || division == null || division.isBlank()) throw new IllegalArgumentException("Incomplete team");
        }
    }

    public record Game(int week, String home, String away, int homeScore, int awayScore) {}
    public enum Status { RESOLVED, UNRESOLVED }
    public record Rank(int position, Set<String> teams, Status status, Step unresolvedAt) {
        public Rank { teams = Collections.unmodifiableSet(new TreeSet<>(teams)); }
    }
    public record Trace(String context, Set<String> tied, Step step, Set<String> remaining, Status status) {
        public Trace {
            tied = Collections.unmodifiableSet(new TreeSet<>(tied));
            remaining = Collections.unmodifiableSet(new TreeSet<>(remaining));
        }
    }
    public record Record(int wins, int losses, int ties, double strengthOfVictory, double strengthOfSchedule) {
        public double winPercentage() { return wins + losses + ties == 0 ? 0 : (wins + ties * 0.5) / (wins + losses + ties); }
    }
    public record Result(Map<String, List<Rank>> conferences, Map<String, Rank> divisionRanks,
                         Map<String, Record> records, List<Trace> trace,
                         Map<String, List<Rank>> unresolvedConferences) {}

    private record Ratio(long numerator, long denominator) implements Comparable<Ratio> {
        private Ratio {
            if (denominator == 0) { numerator = 0; denominator = 1; }
        }
        public int compareTo(Ratio other) {
            return Long.compare(numerator * other.denominator, other.numerator * denominator);
        }
        double value() { return (double) numerator / denominator; }
    }
    private record Selection(Set<String> teams, Step unresolvedAt) {}

    private final TiebreakerRules rules;
    private final boolean madden;
    private final Set<String> divisionsWithWildCard = new HashSet<>();
    private enum MaddenContext { STANDARD, WILD_CARD, AFTER_REDUCTION }
    private final Map<String, Team> teams = new TreeMap<>();
    private final Map<String, List<Game>> games = new HashMap<>();
    private final Map<String, Rank> divisionRanks = new TreeMap<>();
    private final List<Trace> trace = new ArrayList<>();

    private PlayoffSeeding(List<Team> teams, List<Game> schedule, TiebreakerRules rules,
                          boolean madden) {
        this.rules = Objects.requireNonNull(rules);
        this.madden = madden;
        for (var team : teams) {
            if (this.teams.putIfAbsent(team.abbr(), team) != null) throw new IllegalArgumentException("Duplicate team " + team.abbr());
            games.put(team.abbr(), new ArrayList<>());
        }
        for (var game : schedule) {
            if (!games.containsKey(game.home()) || !games.containsKey(game.away())
                    || game.home().equals(game.away()) || game.week() < 0
                    || game.homeScore() < 0 || game.awayScore() < 0) throw new IllegalArgumentException("Invalid game " + game);
            games.get(game.home()).add(game);
            games.get(game.away()).add(game);
        }
    }

    public static Result seed(List<Team> teams, List<Game> games) {
        return seed(teams, games, TiebreakerRules.nfl());
    }

    public static Result seed(List<Team> teams, List<Game> games, TiebreakerRules rules) {
        return new PlayoffSeeding(teams, games, rules, false).seed();
    }

    static Result seedMadden(List<Team> teams, List<Game> games) {
        return new PlayoffSeeding(teams, games, TiebreakerRules.nfl(), true).seed();
    }

    static List<Rank> rankMaddenTie(List<Team> teams, List<Game> games, Set<String> tied,
                                    boolean wildCard, int spots) {
        if (tied.isEmpty() || !teams.stream().map(Team::abbr).toList().containsAll(tied)
                || spots < 1 || spots > tied.size()) throw new IllegalArgumentException("Invalid tie group");
        var engine = new PlayoffSeeding(teams, games, TiebreakerRules.nfl(), true);
        var context = wildCard ? MaddenContext.WILD_CARD : MaddenContext.STANDARD;
        var selections = wildCard && spots < tied.size()
                ? engine.maddenCutoff(tied, spots, "tie group") : engine.maddenOrder(tied, context, "tie group");
        var result = new ArrayList<Rank>();
        int position = 1;
        for (var selection : selections) {
            if (position > spots) break;
            result.add(new Rank(position, selection.teams(), selection.teams().size() == 1 ? Status.RESOLVED : Status.UNRESOLVED,
                    selection.unresolvedAt()));
            position += selection.teams().size();
        }
        return List.copyOf(result);
    }

    private Result seed() {
        var divisions = new LinkedHashMap<List<String>, Set<String>>();
        teams.forEach((abbr, team) -> divisions.computeIfAbsent(List.of(team.conference(), team.division()), k -> new TreeSet<>()).add(abbr));
        for (var entry : divisions.entrySet()) {
            for (var rank : order(entry.getValue(), true, entry.getKey().get(1), 1)) {
                rank.teams().forEach(team -> divisionRanks.put(team, rank));
            }
        }
        var conferences = new TreeMap<String, List<Rank>>();
        var unresolvedConferences = new TreeMap<String, List<Rank>>();
        for (var conference : teams.values().stream().map(Team::conference).distinct().toList()) {
            var unresolved = teams.values().stream().filter(t -> t.conference().equals(conference))
                    .map(t -> divisionRanks.get(t.abbr())).filter(r -> r.status() == Status.UNRESOLVED).distinct().toList();
            if (!unresolved.isEmpty()) {
                unresolvedConferences.put(conference, unresolved);
                continue;
            }
            var winners = new TreeSet<String>();
            var others = new TreeSet<String>();
            teams.forEach((abbr, team) -> {
                if (team.conference().equals(conference)) {
                    if (divisionRanks.get(abbr).position() == 1) winners.add(abbr);
                    else others.add(abbr);
                }
            });
            var ranks = new ArrayList<>(order(winners, false, conference + " division winners", 1));
            ranks.addAll(order(others, false, conference + " wild cards", winners.size() + 1, winners.size() + 3));
            conferences.put(conference, List.copyOf(ranks));
        }
        var records = new TreeMap<String, Record>();
        teams.keySet().forEach(team -> {
            int wins = 0, losses = 0, ties = 0;
            for (var game : games.get(team)) {
                int net = net(team, game);
                if (net > 0) wins++;
                else if (net < 0) losses++;
                else ties++;
            }
            records.put(team, new Record(wins, losses, ties, strength(team, true).value(), strength(team, false).value()));
        });
        return new Result(Collections.unmodifiableMap(conferences), Collections.unmodifiableMap(divisionRanks),
                Collections.unmodifiableMap(records), List.copyOf(trace), Collections.unmodifiableMap(unresolvedConferences));
    }

    private List<Rank> order(Set<String> clubs, boolean division, String context, int start) {
        return order(clubs, division, context, start, 0);
    }

    private List<Rank> order(Set<String> clubs, boolean division, String context, int start, int wildCardEnd) {
        if (madden && wildCardEnd > 0) divisionsWithWildCard.clear();
        var pending = new TreeSet<>(clubs);
        var result = new ArrayList<Rank>();
        while (!pending.isEmpty()) {
            var tied = best(pending, team -> percentage(team, game -> true));
            List<Selection> selections;
            if (madden) {
                int open = Math.max(0, wildCardEnd - start + 1);
                selections = open > 0 && tied.size() > open
                        ? maddenCutoff(tied, open, context) : maddenOrder(tied,
                        wildCardEnd > 0 ? MaddenContext.WILD_CARD : MaddenContext.STANDARD, context);
            } else {
                selections = rules.rankingMode() == TiebreakerRules.RankingMode.TIERED
                        ? tiered(tied, division, context, 0) : List.of(select(tied, division, context));
            }
            for (var selected : selections) {
                result.add(new Rank(start, selected.teams(), selected.teams().size() == 1 ? Status.RESOLVED : Status.UNRESOLVED,
                        selected.unresolvedAt()));
                start += selected.teams().size();
                pending.removeAll(selected.teams());
            }
            if (madden && wildCardEnd > 0) {
                result.stream().filter(r -> r.position() + r.teams().size() - 1 <= wildCardEnd)
                        .flatMap(r -> r.teams().stream()).forEach(t -> divisionsWithWildCard.add(teams.get(t).division()));
            }
        }
        return result;
    }

    private List<Selection> maddenCutoff(Set<String> tied, int open, String context) {
        var ranked = maddenOrder(tied, MaddenContext.WILD_CARD, context + " SELECT");
        var qualifiers = new TreeSet<String>();
        int groups = 0;
        for (var selection : ranked) {
            if (qualifiers.size() + selection.teams().size() > open) return ranked;
            qualifiers.addAll(selection.teams());
            groups++;
            if (qualifiers.size() == open) break;
        }
        trace.add(new Trace(context + " SELECT " + open, tied, null, qualifiers, Status.RESOLVED));
        var result = new ArrayList<>(maddenOrder(qualifiers, MaddenContext.WILD_CARD, context + " ORDER selected"));
        result.addAll(ranked.subList(groups, ranked.size()));
        return result;
    }

    private List<Selection> maddenOrder(Set<String> tied, MaddenContext mode, String context) {
        if (tied.isEmpty()) return List.of();
        if (tied.size() == 1) return List.of(new Selection(tied, null));
        if (tied.size() == 2) {
            var steps = mode == MaddenContext.AFTER_REDUCTION
                    ? List.of(Step.HEAD_TO_HEAD, Step.CONFERENCE_RECORD, Step.COMMON_GAMES,
                    Step.STRENGTH_OF_VICTORY, Step.STRENGTH_OF_SCHEDULE, Step.NET_POINTS_ALL)
                    : List.of(Step.HEAD_TO_HEAD, Step.DIVISION_RECORD, Step.COMMON_GAMES,
                    Step.CONFERENCE_RECORD, Step.STRENGTH_OF_VICTORY, Step.STRENGTH_OF_SCHEDULE, Step.NET_POINTS_ALL);
            return maddenSteps(tied, mode, context, steps);
        }
        var losers = new TreeSet<String>();
        for (var team : tied) {
            if (tied.stream().filter(t -> !t.equals(team)).allMatch(other -> games.get(team).stream()
                    .anyMatch(g -> opponent(team, g).equals(other) && net(team, g) < 0))) losers.add(team);
        }
        if (losers.size() == 1) {
            var rest = new TreeSet<>(tied);
            rest.removeAll(losers);
            return maddenTiers(tied, List.of(rest, losers), Step.HEAD_TO_HEAD_SWEEP, mode, context);
        }
        if (mode == MaddenContext.WILD_CARD) {
            var divisions = new LinkedHashMap<String, Set<String>>();
            tied.forEach(t -> divisions.computeIfAbsent(teams.get(t).division(), k -> new TreeSet<>()).add(t));
            var kept = new TreeSet<String>();
            for (var entry : divisions.entrySet()) {
                var peers = entry.getValue();
                var ranking = peers.size() == 2 ? maddenSteps(peers, MaddenContext.STANDARD, context + " division reduction",
                        List.of(divisionsWithWildCard.contains(entry.getKey()) ? Step.HEAD_TO_HEAD : Step.INVERTED_HEAD_TO_HEAD,
                                Step.DIVISION_RECORD, Step.CONFERENCE_RECORD, Step.COMMON_GAMES,
                                Step.STRENGTH_OF_VICTORY, Step.STRENGTH_OF_SCHEDULE, Step.NET_POINTS_ALL))
                        : maddenOrder(peers, MaddenContext.STANDARD, context + " division reduction");
                var representative = ranking.getFirst();
                if (representative.teams().size() > 1) {
                    trace.add(new Trace(context, tied, Step.DIVISION_REDUCTION, tied, Status.UNRESOLVED));
                    return List.of(new Selection(tied, representative.unresolvedAt()));
                }
                kept.addAll(representative.teams());
            }
            if (kept.size() < tied.size()) {
                trace.add(new Trace(context, tied, Step.DIVISION_REDUCTION, kept, Status.RESOLVED));
                var rest = new TreeSet<>(tied);
                rest.removeAll(kept);
                var result = new ArrayList<>(maddenOrder(kept, MaddenContext.AFTER_REDUCTION, context));
                result.addAll(maddenOrder(rest, mode, context));
                return result;
            }
        }
        return maddenSteps(tied, mode, context, List.of(Step.INVERTED_HEAD_TO_HEAD, Step.COMMON_GAMES,
                Step.CONFERENCE_RECORD, Step.DIVISION_RECORD, Step.STRENGTH_OF_VICTORY,
                Step.STRENGTH_OF_SCHEDULE, Step.NET_POINTS_ALL));
    }

    private List<Selection> maddenSteps(Set<String> tied, MaddenContext mode, String context, List<Step> steps) {
        for (var step : steps) {
            var tiers = step == Step.INVERTED_HEAD_TO_HEAD ? partition(tied, team -> {
                var record = percentage(team, g -> tied.contains(opponent(team, g)));
                if (games.get(team).stream().noneMatch(g -> tied.contains(opponent(team, g)))) record = new Ratio(1, 2);
                return new Ratio(-record.numerator(), record.denominator());
            }) : evaluate(tied, step, mode != MaddenContext.AFTER_REDUCTION || tied.size() != 2);
            if (tiers.size() > 1) return maddenTiers(tied, tiers, step, mode, context);
        }
        trace.add(new Trace(context, tied, Step.NET_POINTS_ALL, tied, Status.UNRESOLVED));
        return List.of(new Selection(tied, Step.NET_POINTS_ALL));
    }

    private List<Selection> maddenTiers(Set<String> tied, List<Set<String>> tiers, Step step,
                                       MaddenContext mode, String context) {
        var result = new ArrayList<Selection>();
        for (var tier : tiers) {
            trace.add(new Trace(context, tied, step, tier, Status.RESOLVED));
            result.addAll(maddenOrder(tier, mode, context));
        }
        return result;
    }

    private List<Step> steps(Set<String> tied, boolean division) {
        return division ? (tied.size() == 2 ? rules.divisionTwo() : rules.divisionMultiple())
                : (tied.size() == 2 ? rules.wildCardTwo() : rules.wildCardMultiple());
    }

    private Set<String> divisionLeaders(Set<String> tied) {
        var leaders = new TreeSet<>(tied);
        leaders.removeIf(t -> tied.stream().anyMatch(other -> sameDivision(t, other)
                && divisionRanks.get(other).position() < divisionRanks.get(t).position()));
        return leaders;
    }

    private List<Selection> tiered(Set<String> tied, boolean division, String context, int firstStep) {
        if (tied.size() == 1) return List.of(new Selection(tied, null));
        if (!division && tied.stream().allMatch(t -> sameDivision(tied.iterator().next(), t))) {
            var result = new ArrayList<Selection>();
            tied.stream().sorted(Comparator.comparingInt(t -> divisionRanks.get(t).position())).forEach(t -> {
                trace.add(new Trace(context + " division order", tied, null, Set.of(t), Status.RESOLVED));
                result.add(new Selection(Set.of(t), null));
            });
            return result;
        }
        if (!division && tied.size() > 2 && rules.reduceWildCardsByDivision()) {
            var leaders = divisionLeaders(tied);
            if (!leaders.equals(tied)) {
                trace.add(new Trace(context + " division reduction", tied, null, leaders, Status.RESOLVED));
                var deferred = new TreeSet<>(tied);
                deferred.removeAll(leaders);
                var result = new ArrayList<>(tiered(leaders, false, context, 0));
                result.addAll(tiered(deferred, false, context, 0));
                return result;
            }
        }
        var steps = steps(tied, division);
        for (int index = firstStep; index < steps.size(); index++) {
            var step = steps.get(index);
            if (step == Step.NET_TOUCHDOWNS || step == Step.COIN_TOSS) {
                trace.add(new Trace(context, tied, step, tied, Status.UNRESOLVED));
                return List.of(new Selection(tied, step));
            }
            var tiers = evaluate(tied, step, division);
            if (tiers.size() == 1) continue;
            var result = new ArrayList<Selection>();
            for (var tier : tiers) {
                trace.add(new Trace(context, tied, step, tier, Status.RESOLVED));
                result.addAll(tiered(tier, division, context,
                        tier.size() == 2 || rules.restartAfterElimination() ? 0 : index + 1));
            }
            return result;
        }
        trace.add(new Trace(context, tied, null, tied, Status.UNRESOLVED));
        return List.of(new Selection(tied, null));
    }

    private Selection select(Set<String> tied, boolean division, String context) {
        if (tied.size() == 1) return new Selection(tied, null);
        if (!division && tied.stream().allMatch(t -> sameDivision(tied.iterator().next(), t))) {
            var top = best(tied, t -> new Ratio(-divisionRanks.get(t).position(), 1));
            trace.add(new Trace(context + " division order", tied, null, top, top.size() == 1 ? Status.RESOLVED : Status.UNRESOLVED));
            return new Selection(top, top.size() == 1 ? null : divisionRanks.get(top.iterator().next()).unresolvedAt());
        }
        var candidates = new TreeSet<>(tied);
        if (!division && candidates.size() > 2 && rules.reduceWildCardsByDivision()) {
            candidates = new TreeSet<>(divisionLeaders(tied));
            if (!candidates.equals(tied)) {
                trace.add(new Trace(context + " division reduction", tied, null, candidates, Status.RESOLVED));
            }
        }
        if (candidates.size() == 1) return new Selection(candidates, null);
        var steps = steps(candidates, division);
        for (var step : steps) {
            if (step == Step.NET_TOUCHDOWNS || step == Step.COIN_TOSS) {
                trace.add(new Trace(context, candidates, step, candidates, Status.UNRESOLVED));
                return new Selection(candidates, step);
            }
            var remaining = evaluate(candidates, step, division).getFirst();
            if (remaining.equals(candidates)) continue;
            trace.add(new Trace(context, candidates, step, remaining, Status.RESOLVED));
            if (remaining.size() == 1) return new Selection(remaining, null);
            if (rules.restartAfterElimination()) return select(remaining, division, context);
            candidates = new TreeSet<>(remaining);
        }
        trace.add(new Trace(context, candidates, null, candidates, Status.UNRESOLVED));
        return new Selection(candidates, steps.isEmpty() ? null : steps.getLast());
    }

    private List<Set<String>> evaluate(Set<String> tied, Step step, boolean division) {
        if (step == Step.HEAD_TO_HEAD || step == Step.HEAD_TO_HEAD_SWEEP) {
            if (rules.headToHeadMode() == TiebreakerRules.HeadToHeadMode.SKIP) return List.of(tied);
            if (rules.headToHeadMode() == TiebreakerRules.HeadToHeadMode.INVERTED
                    && (rules.invertedScope() == TiebreakerRules.InvertedScope.ALL || tied.size() > 2)) {
                if (rules.noGamesPolicy() == TiebreakerRules.NoGamesPolicy.NOT_APPLICABLE
                        && tied.stream().anyMatch(t -> games.get(t).stream().noneMatch(g -> tied.contains(opponent(t, g))))) {
                    return List.of(tied);
                }
                return partition(tied, team -> {
                    var record = percentage(team, g -> tied.contains(opponent(team, g)));
                    if (games.get(team).stream().noneMatch(g -> tied.contains(opponent(team, g)))) {
                        record = rules.noGamesPolicy() == TiebreakerRules.NoGamesPolicy.NO_GAMES_HALF
                                ? new Ratio(1, 2) : new Ratio(0, 1);
                    }
                    return new Ratio(-record.numerator(), record.denominator());
                });
            }
        }
        var common = new HashSet<>(teams.keySet());
        for (var team : tied) {
            var opponents = new HashSet<String>();
            games.get(team).forEach(game -> opponents.add(opponent(team, game)));
            common.retainAll(opponents);
        }
        if (step == Step.HEAD_TO_HEAD_SWEEP) {
            var winners = new TreeSet<String>();
            var losers = new TreeSet<String>();
            for (var team : tied) {
                boolean beatAll = true, lostAll = true;
                for (var other : tied) {
                    if (other.equals(team)) continue;
                    var meetings = games.get(team).stream().filter(g -> opponent(team, g).equals(other)).toList();
                    beatAll &= meetings.stream().anyMatch(g -> net(team, g) > 0);
                    lostAll &= meetings.stream().anyMatch(g -> net(team, g) < 0);
                }
                if (beatAll) winners.add(team);
                if (lostAll) losers.add(team);
            }
            if (winners.size() == 1) {
                var remaining = new TreeSet<>(tied);
                remaining.removeAll(winners);
                return List.of(winners, remaining);
            }
            if (losers.size() == 1) {
                var remaining = new TreeSet<>(tied);
                remaining.removeAll(losers);
                return List.of(remaining, losers);
            }
            return List.of(tied);
        }
        if (step == Step.HEAD_TO_HEAD && tied.stream().anyMatch(t -> games.get(t).stream()
                .noneMatch(g -> tied.contains(opponent(t, g))))) return List.of(tied);
        if (step == Step.COMMON_GAMES && !division && tied.stream().anyMatch(t -> games.get(t).stream()
                .filter(g -> common.contains(opponent(t, g))).count() < rules.wildCardCommonGamesMinimum())) return List.of(tied);
        return partition(tied, team -> switch (step) {
            case HEAD_TO_HEAD -> percentage(team, g -> tied.contains(opponent(team, g)));
            case DIVISION_RECORD -> percentage(team, g -> sameDivision(team, opponent(team, g)));
            case COMMON_GAMES -> percentage(team, g -> common.contains(opponent(team, g)));
            case CONFERENCE_RECORD -> percentage(team, g -> sameConference(team, opponent(team, g)));
            case STRENGTH_OF_VICTORY -> strength(team, true);
            case STRENGTH_OF_SCHEDULE -> strength(team, false);
            case COMBINED_RANKING_CONFERENCE -> new Ratio(-combinedRanking(team, true), 1);
            case COMBINED_RANKING_ALL -> new Ratio(-combinedRanking(team, false), 1);
            case NET_POINTS_COMMON -> new Ratio(netPoints(team, g -> common.contains(opponent(team, g))), 1);
            case NET_POINTS_CONFERENCE -> new Ratio(netPoints(team, g -> sameConference(team, opponent(team, g))), 1);
            case NET_POINTS_ALL -> new Ratio(netPoints(team, g -> true), 1);
            default -> throw new IllegalArgumentException("Unavailable step " + step);
        });
    }

    private List<Set<String>> partition(Set<String> clubs, java.util.function.Function<String, Ratio> metric) {
        var tiers = new TreeMap<Ratio, Set<String>>(Comparator.reverseOrder());
        for (var club : clubs) tiers.computeIfAbsent(metric.apply(club), k -> new TreeSet<>()).add(club);
        return new ArrayList<>(tiers.values());
    }

    private Set<String> best(Set<String> clubs, java.util.function.Function<String, Ratio> metric) {
        var result = new TreeSet<String>();
        Ratio highest = null;
        for (var club : clubs) {
            var value = metric.apply(club);
            int comparison = highest == null ? 1 : value.compareTo(highest);
            if (comparison > 0) { result.clear(); highest = value; }
            if (comparison >= 0) result.add(club);
        }
        return result;
    }

    private Ratio percentage(String team, Predicate<Game> filter) {
        long points = 0, played = 0;
        for (var game : games.get(team)) {
            if (!filter.test(game)) continue;
            played++;
            points += net(team, game) > 0 ? 2 : net(team, game) == 0 ? 1 : 0;
        }
        return new Ratio(points, 2 * played);
    }

    private Ratio strength(String team, boolean victoriesOnly) {
        long points = 0, played = 0;
        for (var game : games.get(team)) {
            if (victoriesOnly && net(team, game) <= 0) continue;
            var record = percentage(opponent(team, game), g -> true);
            points += record.numerator();
            played += record.denominator();
        }
        return new Ratio(points, played);
    }

    private int combinedRanking(String team, boolean conferenceOnly) {
        int scored = points(team, true), allowed = points(team, false), rank = 2;
        for (var other : teams.keySet()) {
            if (conferenceOnly && !sameConference(team, other)) continue;
            if (points(other, true) > scored) rank++;
            if (points(other, false) < allowed) rank++;
        }
        return rank;
    }

    private int points(String team, boolean scored) {
        return games.get(team).stream().mapToInt(g -> g.home().equals(team) == scored ? g.homeScore() : g.awayScore()).sum();
    }
    private int netPoints(String team, Predicate<Game> filter) {
        return games.get(team).stream().filter(filter).mapToInt(g -> net(team, g)).sum();
    }
    private int net(String team, Game game) { return game.home().equals(team) ? game.homeScore() - game.awayScore() : game.awayScore() - game.homeScore(); }
    private String opponent(String team, Game game) { return game.home().equals(team) ? game.away() : game.home(); }
    private boolean sameDivision(String a, String b) { return sameConference(a, b) && teams.get(a).division().equals(teams.get(b).division()); }
    private boolean sameConference(String a, String b) { return teams.get(a).conference().equals(teams.get(b).conference()); }
}
