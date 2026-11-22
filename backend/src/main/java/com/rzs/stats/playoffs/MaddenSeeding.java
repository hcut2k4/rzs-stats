package com.rzs.stats.playoffs;

import java.util.*;

import static com.rzs.stats.playoffs.PlayoffSeeding.*;
import static com.rzs.stats.playoffs.TiebreakerRules.Step;

public record MaddenSeeding() {
    public static MaddenSeeding madden27() {
        return new MaddenSeeding();
    }

    public Result seed(List<Team> teams, List<Game> games) {
        return new Engine(teams, games).seed();
    }

    private static final class Engine {
        private static final List<Step> STEPS = List.of(Step.HEAD_TO_HEAD, Step.DIVISION_RECORD,
                Step.COMMON_GAMES, Step.CONFERENCE_RECORD, Step.STRENGTH_OF_VICTORY,
                Step.STRENGTH_OF_SCHEDULE, Step.NET_POINTS_CONFERENCE, Step.NET_POINTS_ALL);
        private final List<Team> teams;
        private final int[][] wins, played, ties;
        private final int[] totalWins, totalGames, totalTies, net, conferenceNet;
        private final double[] pct, divisionPct, conferencePct, sov, sos;
        private final List<Trace> trace = new ArrayList<>();

        Engine(List<Team> source, List<Game> schedule) {
            teams = source.stream().sorted(Comparator.comparing(Team::abbr)).toList();
            int n = teams.size();
            wins = new int[n][n]; played = new int[n][n]; ties = new int[n][n];
            totalWins = new int[n]; totalGames = new int[n]; totalTies = new int[n];
            net = new int[n]; conferenceNet = new int[n];
            pct = new double[n]; divisionPct = new double[n]; conferencePct = new double[n];
            sov = new double[n]; sos = new double[n];
            var index = new HashMap<String, Integer>();
            for (int i = 0; i < n; i++) {
                if (index.putIfAbsent(teams.get(i).abbr(), i) != null) throw new IllegalArgumentException("Duplicate team " + teams.get(i).abbr());
            }
            for (var game : schedule) {
                var h = index.get(game.home());
                var a = index.get(game.away());
                if (h == null || a == null || h.equals(a) || game.week() < 0
                        || game.homeScore() < 0 || game.awayScore() < 0) throw new IllegalArgumentException("Invalid game " + game);
                if (game.week() > 17) continue;
                played[h][a]++; played[a][h]++;
                int margin = game.homeScore() - game.awayScore();
                if (margin > 0) wins[h][a]++;
                else if (margin < 0) wins[a][h]++;
                else { ties[h][a]++; ties[a][h]++; }
                net[h] += margin; net[a] -= margin;
                if (sameConference(h, a)) { conferenceNet[h] += margin; conferenceNet[a] -= margin; }
            }
            for (int i = 0; i < n; i++) {
                int dw = 0, dt = 0, dg = 0, cw = 0, ct = 0, cg = 0;
                for (int j = 0; j < n; j++) {
                    totalWins[i] += wins[i][j]; totalGames[i] += played[i][j]; totalTies[i] += ties[i][j];
                    if (sameConference(i, j)) {
                        cw += wins[i][j]; ct += ties[i][j]; cg += played[i][j];
                        if (teams.get(i).division().equals(teams.get(j).division())) {
                            dw += wins[i][j]; dt += ties[i][j]; dg += played[i][j];
                        }
                    }
                }
                pct[i] = percentage(totalWins[i], totalTies[i], totalGames[i]);
                divisionPct[i] = percentage(dw, dt, dg); conferencePct[i] = percentage(cw, ct, cg);
            }
            for (int i = 0; i < n; i++) {
                for (int j = 0; j < n; j++) { sov[i] += wins[i][j] * pct[j]; sos[i] += played[i][j] * pct[j]; }
                sov[i] = totalWins[i] == 0 ? 0 : sov[i] / totalWins[i];
                sos[i] = totalGames[i] == 0 ? 0 : sos[i] / totalGames[i];
            }
        }

        Result seed() {
            var conferences = new TreeMap<String, List<Rank>>();
            var divisionRanks = new TreeMap<String, Rank>();
            var records = new TreeMap<String, PlayoffSeeding.Record>();
            var pools = new TreeMap<String, Map<String, List<Integer>>>();
            for (int i = 0; i < teams.size(); i++) {
                var team = teams.get(i);
                pools.computeIfAbsent(team.conference(), k -> new TreeMap<>())
                        .computeIfAbsent(team.division(), k -> new ArrayList<>()).add(i);
                records.put(team.abbr(), new PlayoffSeeding.Record(totalWins[i], totalGames[i] - totalWins[i] - totalTies[i], totalTies[i], sov[i], sos[i]));
            }
            for (var conference : pools.entrySet()) {
                var winners = new ArrayList<Integer>();
                var others = new ArrayList<Integer>();
                for (var division : conference.getValue().entrySet()) {
                    var ordered = order(division.getValue(), conference.getKey() + " division " + division.getKey());
                    winners.add(ordered.getFirst());
                    others.addAll(ordered.subList(1, ordered.size()));
                    for (int i = 0; i < ordered.size(); i++) divisionRanks.put(teams.get(ordered.get(i)).abbr(), rank(i + 1, ordered.get(i)));
                }
                var ordered = new ArrayList<>(order(winners, conference.getKey() + " division winner seeding"));
                ordered.addAll(order(others, conference.getKey() + " wild card seeding"));
                var ranks = new ArrayList<Rank>();
                for (int i = 0; i < ordered.size(); i++) ranks.add(rank(i + 1, ordered.get(i)));
                conferences.put(conference.getKey(), List.copyOf(ranks));
            }
            return new Result(Collections.unmodifiableMap(conferences), Collections.unmodifiableMap(divisionRanks),
                    Collections.unmodifiableMap(records), List.copyOf(trace), Map.of());
        }

        private Rank rank(int position, int team) {
            return new Rank(position, Set.of(teams.get(team).abbr()), Status.RESOLVED, null);
        }

        private List<Integer> order(List<Integer> pool, String context) {
            var groups = new TreeMap<Double, List<Integer>>(Comparator.reverseOrder());
            for (int t : pool) groups.computeIfAbsent(rounded(pct[t]), k -> new ArrayList<>()).add(t);
            var result = new ArrayList<Integer>();
            for (var group : groups.values()) result.addAll(tiedOrder(group, context));
            return result;
        }

        private List<Integer> tiedOrder(List<Integer> pool, String context) {
            var group = pool.stream().sorted().toList();
            if (group.size() < 2) return group;
            for (var step : STEPS) {
                var values = values(group, step);
                var clusters = new TreeMap<Double, List<Integer>>(Comparator.reverseOrder());
                if (group.size() == 2) {
                    int a = group.getFirst(), b = group.getLast();
                    if (Math.abs(values[a] - values[b]) < 1e-12) continue;
                    var ordered = values[a] > values[b] ? group : List.of(b, a);
                    log(context, group, step, ordered.subList(0, 1), values, false);
                    return ordered;
                }
                for (int t : group) clusters.computeIfAbsent(rounded(values[t]), k -> new ArrayList<>()).add(t);
                if (clusters.size() == 1) continue;
                int largest = clusters.values().stream().mapToInt(List::size).max().orElseThrow();
                if (largest == 1) {
                    var ordered = new ArrayList<>(group);
                    ordered.sort(Comparator.comparingDouble((Integer t) -> values[t]).reversed());
                    log(context, group, step, ordered.subList(0, 1), values, false);
                    return ordered;
                }
                var keep = new ArrayList<Integer>();
                var rest = new ArrayList<List<Integer>>();
                for (var cluster : clusters.values()) {
                    if (cluster.size() == largest) keep.addAll(cluster);
                    else rest.add(cluster);
                }
                if (rest.isEmpty()) continue;
                log(context, group, step, keep, values, true);
                var ordered = new ArrayList<>(tiedOrder(keep, context));
                for (var cluster : rest) ordered.addAll(tiedOrder(cluster, context));
                return ordered;
            }
            log(context, group, Step.ALPHABETICAL, group.subList(0, 1), new double[teams.size()], false);
            return group;
        }

        private double[] values(List<Integer> group, Step step) {
            if (step == Step.DIVISION_RECORD) return divisionPct;
            if (step == Step.CONFERENCE_RECORD) return conferencePct;
            if (step == Step.STRENGTH_OF_VICTORY) return sov;
            if (step == Step.STRENGTH_OF_SCHEDULE) return sos;
            var values = new double[teams.size()];
            if (step == Step.COMMON_GAMES) {
                var common = new boolean[teams.size()];
                Arrays.fill(common, true);
                for (int t : group) for (int j = 0; j < teams.size(); j++) common[j] &= played[t][j] > 0;
                for (int t : group) common[t] = false;
                for (int t : group) {
                    int w = 0, tt = 0, g = 0;
                    for (int j = 0; j < teams.size(); j++) if (common[j]) { w += wins[t][j]; tt += ties[t][j]; g += played[t][j]; }
                    values[t] = percentage(w, tt, g);
                }
            } else for (int t : group) {
                if (step == Step.HEAD_TO_HEAD) for (int other : group) values[t] += wins[t][other] + ties[t][other] * .5;
                else values[t] = step == Step.NET_POINTS_CONFERENCE ? conferenceNet[t] : net[t];
            }
            return values;
        }

        private void log(String context, List<Integer> group, Step step, List<Integer> first, double[] values, boolean biggest) {
            var counts = new TreeMap<String, Double>();
            var metrics = new TreeMap<String, Double>();
            var tied = new TreeSet<String>();
            var remaining = new TreeSet<String>();
            for (int t : group) {
                String abbr = teams.get(t).abbr();
                tied.add(abbr); metrics.put(abbr, values[t]);
                if (biggest) {
                    double w = 0;
                    for (int other : group) w += wins[t][other] + ties[t][other] * .5;
                    counts.put(abbr, w);
                }
            }
            for (int t : first) remaining.add(teams.get(t).abbr());
            trace.add(new Trace(context, tied, step, remaining, Status.RESOLVED, counts, metrics, biggest));
        }

        private boolean sameConference(int a, int b) { return teams.get(a).conference().equals(teams.get(b).conference()); }
        private static double percentage(int wins, int ties, int games) { return games == 0 ? 0 : (wins + ties * .5) / games; }
        private static double rounded(double value) { return Math.rint(value * 1e9) / 1e9; }
    }
}
