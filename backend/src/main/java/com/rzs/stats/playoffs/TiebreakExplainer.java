package com.rzs.stats.playoffs;

import com.rzs.stats.service.EloService;

import java.util.*;
import java.util.stream.Collectors;

public class TiebreakExplainer {
    public Map<String, List<String>> explain(PlayoffSeeding.Result result, Map<String, EloService.Team> teams) {
        var field = new HashSet<String>();
        result.conferences().values().stream().flatMap(Collection::stream).filter(r -> r.position() <= 7)
                .forEach(r -> field.addAll(r.teams()));
        var reasons = new HashMap<String, LinkedHashSet<String>>();
        for (var trace : result.trace()) {
            if (trace.tied().size() < 2) continue;
            if (trace.status() == PlayoffSeeding.Status.UNRESOLVED) {
                String sentence = names(trace.tied(), teams) + " are tied on all available tiebreakers; "
                        + "the alphabetical order shown is arbitrary (the real NFL uses a coin toss).";
                for (String team : trace.tied()) reasons.computeIfAbsent(team, k -> new LinkedHashSet<>()).add(sentence);
                continue;
            }
            if (Collections.disjoint(field, trace.tied()) || trace.remaining().equals(trace.tied())) continue;
            var behind = new TreeSet<>(trace.tied());
            behind.removeAll(trace.remaining());
            String sentence;
            if (trace.biggestSetFirst()) {
                String metric = switch (trace.step()) {
                    case HEAD_TO_HEAD, HEAD_TO_HEAD_SWEEP -> "head-to-head win count";
                    case DIVISION_RECORD -> "division winning percentage";
                    case COMMON_GAMES -> "winning percentage against common opponents";
                    case CONFERENCE_RECORD -> "conference winning percentage";
                    case STRENGTH_OF_VICTORY -> "strength of victory";
                    case STRENGTH_OF_SCHEDULE -> "strength of schedule";
                    default -> "point differential";
                };
                boolean sameValue = trace.remaining().stream().map(trace.values()::get).distinct().count() == 1;
                sentence = names(trace.remaining(), teams) + " finished ahead of " + names(behind, teams)
                        + ": among the " + trace.tied().size() + " teams tied on winning percentage, "
                        + (sameValue ? "they share the same " + metric : "they belong to the largest groups with the same " + metric)
                        + ", and Madden puts the biggest group of teams with the same "
                        + (trace.step() == TiebreakerRules.Step.HEAD_TO_HEAD ? "count" : "value") + " first.";
            } else if (trace.context().endsWith(" division reduction")) {
                sentence = "Only " + names(trace.remaining(), teams)
                        + " stayed as candidates in this wild-card tiebreaker after keeping the highest-ranked "
                        + "tied team from each division; " + names(behind, teams)
                        + (behind.size() == 1 ? " was" : " were") + " deferred until the next wild-card selection.";
            } else if (trace.step() == TiebreakerRules.Step.HEAD_TO_HEAD && trace.tied().size() > 2
                    && !trace.values().isEmpty()) {
                String counts = trace.tied().stream().sorted().map(team -> teams.get(team).displayName()
                        + " " + formatCount(trace.values().get(team))).collect(Collectors.joining(", "));
                sentence = names(trace.remaining(), teams) + " had the most wins against the other tied teams ("
                        + counts + "), ahead of " + names(behind, teams) + ".";
            } else {
                String decision = trace.step() == null ? "Finished higher in the division" : switch (trace.step()) {
                    case HEAD_TO_HEAD, HEAD_TO_HEAD_SWEEP -> trace.tied().size() == 2
                            ? "Won the head-to-head" : "Head-to-head results broke the tie";
                    case DIVISION_RECORD -> "Better division record";
                    case COMMON_GAMES -> "Better record against common opponents";
                    case CONFERENCE_RECORD -> "Better conference record";
                    case STRENGTH_OF_VICTORY -> "Stronger strength of victory";
                    case STRENGTH_OF_SCHEDULE -> "Stronger strength of schedule";
                    case COMBINED_RANKING_CONFERENCE -> "Better combined conference ranking in points scored and points allowed";
                    case COMBINED_RANKING_ALL -> "Better combined league ranking in points scored and points allowed";
                    case NET_POINTS_COMMON, NET_POINTS_CONFERENCE, NET_POINTS_ALL -> "The tie was decided by point differential";
                    case NET_TOUCHDOWNS -> "The tie requires net touchdown totals";
                    case COIN_TOSS -> "The tie requires a coin toss";
                    case ALPHABETICAL -> "Madden used alphabetical order after all available tiebreakers were equal";
                };
                sentence = decision + ": " + names(trace.remaining(), teams) + " ahead of " + names(behind, teams) + ".";
            }
            for (String team : trace.tied()) reasons.computeIfAbsent(team, k -> new LinkedHashSet<>()).add(sentence);
        }
        var output = new HashMap<String, List<String>>();
        reasons.forEach((team, sentences) -> output.put(team, List.copyOf(sentences)));
        return output;
    }

    private String formatCount(double count) {
        return count == Math.rint(count) ? Long.toString((long) count) : Double.toString(count);
    }

    private String names(Set<String> abbreviations, Map<String, EloService.Team> teams) {
        var names = abbreviations.stream().sorted().map(abbr -> teams.get(abbr).displayName()).toList();
        if (names.size() == 1) return names.getFirst();
        return names.subList(0, names.size() - 1).stream().collect(Collectors.joining(", "))
                + " and " + names.getLast();
    }
}
