package com.rzs.stats.service;

import com.rzs.stats.model.dto.QbDtos;
import com.rzs.stats.model.dto.QbStatDto;
import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.QbGameStatEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.repository.QbGameStatRepository;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class QbStatsService {
    public enum Scope { WEEK, SEASON, ALLTIME }
    public enum Basis { SEASON, ALLTIME }
    public enum Stage {
        REGULAR, PLAYOFFS, BOTH;
        public int minWeek() { return this == PLAYOFFS ? 18 : 0; }
        public int maxWeek() { return this == REGULAR ? 17 : 22; }
    }

    static final int ALLTIME_MIN_ATT = 250;
    // Two playoff brackets exist, so a full-season bar would empty the board; 50 is about two playoff starts.
    static final int ALLTIME_PLAYOFF_MIN_ATT = 50;

    private final QbGameStatRepository repository;
    private final GameRepository games;
    private final QbStatsCalculator calculator;
    private static final Comparator<QbStatDto> ORDER = Comparator.comparing((QbStatDto d) -> d.tanya,
            Comparator.nullsLast(Comparator.reverseOrder())).thenComparing(d -> d.rosterId);

    public QbStatsService(QbGameStatRepository repository, GameRepository games, QbStatsCalculator calculator) {
        this.repository = repository;
        this.games = games;
        this.calculator = calculator;
    }

    @Cacheable("qbStats")
    public List<QbStatDto> leaderboard(Scope scope, Integer season, Integer week, Stage stage, Integer minAtt,
                                       boolean includeUnqualified) {
        if (minAtt != null && minAtt < 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "minAtt must be nonnegative");
        List<QbGameStatEntity> rows = repository.findInScope(scope == Scope.ALLTIME ? null : season, stage.minWeek(), stage.maxWeek());
        int selectedSeason = season == null ? rows.stream().mapToInt(QbGameStatEntity::getSeasonIndex).max().orElse(0) : season;
        if (scope != Scope.ALLTIME) rows = rows.stream().filter(r -> r.getSeasonIndex() == selectedSeason).toList();
        int endWeek = week == null ? rows.stream().mapToInt(QbGameStatEntity::getWeekIndex).max().orElse(stage.minWeek()) : week;
        List<GameEntity> teamGames = games.findCompletedInScope(scope == Scope.ALLTIME ? null : selectedSeason, stage.minWeek(), stage.maxWeek());
        List<QbGameStatEntity> selected = rows.stream().filter(r -> scope == Scope.ALLTIME ||
                (scope == Scope.WEEK ? r.getWeekIndex() == endWeek : r.getWeekIndex() <= endWeek)).toList();
        List<QbStatDto> result = aggregate(selected, teamGames, scope, scope == Scope.ALLTIME ? stage.maxWeek() : endWeek, minAtt, stage);
        Map<String, Integer> changes = scope == Scope.ALLTIME
                ? seasonChanges(rows, teamGames, stage, selectedSeason, minAtt)
                : changes(rows, teamGames, endWeek, endWeek - 1, minAtt, stage);
        result.forEach(d -> d.rankChange = d.qualified ? changes.get(d.rosterId) : null);
        return result.stream().filter(d -> includeUnqualified || d.qualified).toList();
    }

    private List<QbStatDto> aggregate(List<QbGameStatEntity> rows, List<GameEntity> teamGames, Scope scope, int through, Integer minAtt, Stage stage) {
        Map<String, List<QbGameStatEntity>> grouped = rows.stream().collect(Collectors.groupingBy(QbGameStatEntity::getRosterId));
        List<QbStatDto> result = new ArrayList<>();
        for (List<QbGameStatEntity> player : grouped.values()) {
            QbStatDto dto = calculator.calculate(player);
            Set<String> teams = player.stream().map(r -> r.getTeam().getAbbrName()).collect(Collectors.toSet());
            long played = teamGames.stream().filter(g -> g.getWeekIndex() <= through)
                    .filter(g -> teams.contains(abbr(g.getHomeTeam())) || teams.contains(abbr(g.getAwayTeam()))).count();
            long threshold = minAtt != null ? minAtt : switch (scope) {
                case WEEK -> 10;
                case SEASON -> 10 * played;
                case ALLTIME -> stage == Stage.PLAYOFFS ? ALLTIME_PLAYOFF_MIN_ATT : ALLTIME_MIN_ATT;
            };
            dto.qualified = dto.passAtt >= threshold;
            result.add(dto);
        }
        result.sort(ORDER);
        int rank = 0;
        for (QbStatDto d : result) if (d.qualified && d.tanya != null) d.rank = ++rank;
        return result;
    }

    private Map<String, Integer> changes(List<QbGameStatEntity> rows, List<GameEntity> teamGames, int current, int previous, Integer minAtt, Stage stage) {
        return cohortChange(cumulative(rows, teamGames, current, minAtt, stage), cumulative(rows, teamGames, previous, minAtt, stage));
    }

    // All-time movement compares the career board against where it stood before the latest season.
    private Map<String, Integer> seasonChanges(List<QbGameStatEntity> rows, List<GameEntity> teamGames, Stage stage,
                                               int latestSeason, Integer minAtt) {
        List<QbGameStatEntity> prior = rows.stream().filter(r -> r.getSeasonIndex() < latestSeason).toList();
        return cohortChange(aggregate(rows, teamGames, Scope.ALLTIME, stage.maxWeek(), minAtt, stage),
                aggregate(prior, teamGames, Scope.ALLTIME, stage.maxWeek(), minAtt, stage));
    }

    private Map<String, Integer> cohortChange(List<QbStatDto> now, List<QbStatDto> before) {
        Set<String> cohort = now.stream().filter(d -> d.rank != null).map(d -> d.rosterId).collect(Collectors.toSet());
        Set<String> previouslyQualified = before.stream().filter(d -> d.rank != null).map(d -> d.rosterId).collect(Collectors.toSet());
        Map<String, Integer> oldRanks = cohortRanks(before, cohort);
        Map<String, Integer> newRanks = cohortRanks(now, cohort);
        Map<String, Integer> result = new HashMap<>();
        for (String id : cohort) if (previouslyQualified.contains(id) && oldRanks.containsKey(id))
            result.put(id, oldRanks.get(id) - newRanks.get(id));
        return result;
    }

    private Map<String, Integer> cohortRanks(List<QbStatDto> rows, Set<String> cohort) {
        Map<String, Integer> result = new HashMap<>();
        for (QbStatDto d : rows) if (cohort.contains(d.rosterId) && d.tanya != null) result.put(d.rosterId, result.size() + 1);
        return result;
    }

    private List<QbStatDto> cumulative(List<QbGameStatEntity> rows, List<GameEntity> teamGames, int week, Integer minAtt, Stage stage) {
        return aggregate(rows.stream().filter(r -> r.getWeekIndex() <= week).toList(), teamGames, Scope.SEASON, week, minAtt, stage);
    }

    @Cacheable("qbStats")
    public QbDtos.Movement movement(Integer season, Stage stage, int window, Basis basis) {
        if (window < 1) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "window must be positive");
        boolean career = basis == Basis.ALLTIME;
        List<QbGameStatEntity> rows = repository.findInScope(career ? null : season, stage.minWeek(), stage.maxWeek());
        int selectedSeason = season == null ? rows.stream().mapToInt(QbGameStatEntity::getSeasonIndex).max().orElse(0) : season;
        if (!career) rows = rows.stream().filter(r -> r.getSeasonIndex() == selectedSeason).toList();
        List<GameEntity> teamGames = games.findCompletedInScope(career ? null : selectedSeason, stage.minWeek(), stage.maxWeek());

        // Points come from weeks that actually have games, so an empty playoff week never reaches the chart.
        List<Point> points = rows.stream().map(r -> new Point(r.getSeasonIndex(), r.getWeekIndex())).distinct()
                .sorted(Comparator.comparingInt(Point::season).thenComparingInt(Point::week)).toList();
        if (points.isEmpty()) return new QbDtos.Movement(List.of(), List.of(), List.of());

        List<QbGameStatEntity> scoped = rows;
        List<QbStatDto> now = boardAt(scoped, teamGames, points.getLast(), career, stage);
        List<QbStatDto> before = boardAt(scoped, teamGames, points.get(Math.max(0, points.size() - 1 - window)), career, stage);
        Map<String, Integer> changes = cohortChange(now, before);
        List<QbStatDto> current = now.stream().filter(d -> d.rank != null).toList();
        current.forEach(d -> d.rankChange = changes.get(d.rosterId));
        List<QbStatDto> risers = current.stream().filter(d -> d.rankChange != null && d.rankChange > 0)
                .sorted(Comparator.comparingInt((QbStatDto d) -> d.rankChange).reversed().thenComparing(ORDER)).limit(5).toList();
        List<QbStatDto> fallers = current.stream().filter(d -> d.rankChange != null && d.rankChange < 0)
                .sorted(Comparator.comparingInt((QbStatDto d) -> d.rankChange).thenComparing(ORDER)).limit(5).toList();
        Map<String, List<QbDtos.Rank>> history = new LinkedHashMap<>();
        current.stream().limit(10).forEach(d -> history.put(d.rosterId, new ArrayList<>()));
        for (Point p : points) {
            for (QbStatDto d : boardAt(scoped, teamGames, p, career, stage)) if (d.rank != null && history.containsKey(d.rosterId))
                history.get(d.rosterId).add(new QbDtos.Rank(p.season(), p.week(), d.rank, d.tanya));
        }
        List<QbDtos.Series> series = current.stream().limit(10)
                .map(d -> new QbDtos.Series(d.rosterId, d.playerName, d.teamAbbr, history.get(d.rosterId))).toList();
        return new QbDtos.Movement(risers, fallers, series);
    }

    private record Point(int season, int week) {}

    // The career board is re-ranked every week, so a QB can climb the all-time list mid-season.
    private List<QbStatDto> boardAt(List<QbGameStatEntity> rows, List<GameEntity> teamGames, Point p, boolean career, Stage stage) {
        List<QbGameStatEntity> upTo = rows.stream().filter(r -> career
                ? r.getSeasonIndex() < p.season() || (r.getSeasonIndex() == p.season() && r.getWeekIndex() <= p.week())
                : r.getWeekIndex() <= p.week()).toList();
        return aggregate(upTo, teamGames, career ? Scope.ALLTIME : Scope.SEASON, p.week(), null, stage);
    }

    @Cacheable("qbStats")
    public QbDtos.Profile profile(String rosterId, Stage stage) {
        List<QbGameStatEntity> rows = repository.findProfile(rosterId, stage.minWeek(), stage.maxWeek());
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Quarterback not found");
        List<GameEntity> teamGames = games.findCompletedInScope(null, stage.minWeek(), stage.maxWeek());
        List<QbStatDto> seasons = new ArrayList<>();
        Map<Integer, List<QbGameStatEntity>> bySeason = rows.stream().collect(Collectors.groupingBy(QbGameStatEntity::getSeasonIndex, TreeMap::new, Collectors.toList()));
        for (var entry : bySeason.entrySet()) {
            List<GameEntity> seasonGames = teamGames.stream().filter(g -> g.getSeasonIndex().equals(entry.getKey())).toList();
            seasons.addAll(aggregate(entry.getValue(), seasonGames, Scope.SEASON, stage.maxWeek(), null, stage));
        }
        List<QbDtos.Game> gameDtos = rows.stream().map(r -> {
            QbStatDto d = calculator.calculate(List.of(r));
            String opponent = teamGames.stream().filter(g -> g.getSeasonIndex() == r.getSeasonIndex() && g.getWeekIndex() == r.getWeekIndex())
                    .filter(g -> Objects.equals(abbr(g.getHomeTeam()), d.teamAbbr) || Objects.equals(abbr(g.getAwayTeam()), d.teamAbbr))
                    .map(g -> Objects.equals(abbr(g.getHomeTeam()), d.teamAbbr) ? abbr(g.getAwayTeam()) : abbr(g.getHomeTeam()))
                    .findFirst().orElse(null);
            return new QbDtos.Game(r.getSeasonIndex(), r.getWeekIndex(), r.getStageIndex(), opponent, d.tanya,
                    d.passAtt, d.passYds, d.passTd, d.passInt, d.rushAtt, d.rushYds, d.rushTd, d.sackYardsLost, d.fumblesLost);
        }).toList();
        QbStatDto total = calculator.calculate(rows);
        return new QbDtos.Profile(rosterId, total.playerName, total.teamAbbr, total.teamName, seasons, gameDtos,
                new QbDtos.Components(total.passYds, total.sackYardsLost, total.rushYds, 20 * (total.passTd + total.rushTd),
                        45 * (total.passInt + total.fumblesLost)));
    }

    private String abbr(TeamEntity team) { return team == null ? null : team.getAbbrName(); }
}
