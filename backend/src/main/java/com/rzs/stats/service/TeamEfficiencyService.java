package com.rzs.stats.service;

import com.rzs.stats.model.dto.TeamEfficiencyDto;
import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.model.entity.TeamGameStatEntity;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.repository.TeamGameStatRepository;
import com.rzs.stats.service.QbStatsService.Stage;
import com.rzs.stats.service.TeamEfficiencyCalculator.Totals;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import java.util.*;

@Service
public class TeamEfficiencyService {
    private final TeamGameStatRepository stats;
    private final GameRepository games;
    private final TeamEfficiencyCalculator calculator;

    public TeamEfficiencyService(TeamGameStatRepository stats, GameRepository games, TeamEfficiencyCalculator calculator) {
        this.stats = stats;
        this.games = games;
        this.calculator = calculator;
    }

    private record Key(int week, Long teamPk) {}

    private static class Accumulator {
        final TeamEntity team;
        int games;
        final Totals offense = new Totals();
        final Totals defense = new Totals();
        Accumulator(TeamEntity team) { this.team = team; }
    }

    @Cacheable("teamEfficiency")
    public List<TeamEfficiencyDto> efficiency(int season, Stage stage) {
        Map<Key, TeamGameStatEntity> rows = new HashMap<>();
        for (TeamGameStatEntity r : stats.findInScope(season, stage.minWeek(), stage.maxWeek()))
            rows.put(new Key(r.getWeekIndex(), r.getTeam().getId()), r);
        Map<Long, Accumulator> byTeam = new LinkedHashMap<>();
        for (GameEntity g : games.findCompletedInScope(season, stage.minWeek(), stage.maxWeek())) {
            if (g.getHomeTeam() == null || g.getAwayTeam() == null) continue;
            TeamGameStatEntity home = rows.get(new Key(g.getWeekIndex(), g.getHomeTeam().getId()));
            TeamGameStatEntity away = rows.get(new Key(g.getWeekIndex(), g.getAwayTeam().getId()));
            if (home == null || away == null) continue;
            record(byTeam, g.getHomeTeam(), home, away);
            record(byTeam, g.getAwayTeam(), away, home);
        }
        return byTeam.values().stream().map(this::toDto)
                .sorted(Comparator.comparing(TeamEfficiencyDto::netPointsPerDrive, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(TeamEfficiencyDto::teamId))
                .toList();
    }

    private void record(Map<Long, Accumulator> byTeam, TeamEntity team, TeamGameStatEntity own, TeamGameStatEntity opponent) {
        Accumulator a = byTeam.computeIfAbsent(team.getId(), id -> new Accumulator(team));
        a.games++;
        calculator.add(a.offense, own);
        calculator.add(a.defense, opponent);
    }

    private TeamEfficiencyDto toDto(Accumulator a) {
        var offense = calculator.side(a.offense);
        var defense = calculator.side(a.defense);
        Double net = offense.pointsPerDrive() == null || defense.pointsPerDrive() == null
                ? null : offense.pointsPerDrive() - defense.pointsPerDrive();
        TeamEntity t = a.team;
        return new TeamEfficiencyDto(t.getTeamId(), t.getDisplayName(), t.getAbbrName(), t.getCityName(), t.getConference(),
                t.getDivision(), t.getPrimaryColor(), t.getLogoId(), a.games, offense, defense, net);
    }
}
