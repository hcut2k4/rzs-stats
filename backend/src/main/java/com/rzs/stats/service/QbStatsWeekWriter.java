package com.rzs.stats.service;

import com.rzs.stats.model.entity.QbGameStatEntity;
import com.rzs.stats.model.entity.TeamGameStatEntity;
import com.rzs.stats.repository.QbGameStatRepository;
import com.rzs.stats.repository.TeamGameStatRepository;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Arrays;
import java.util.Comparator;

@Service
public class QbStatsWeekWriter {
    private final QbGameStatRepository repository;
    private final TeamGameStatRepository teamRepository;

    public QbStatsWeekWriter(QbGameStatRepository repository, TeamGameStatRepository teamRepository) {
        this.repository = repository;
        this.teamRepository = teamRepository;
    }

    @Transactional
    @CacheEvict(value = {"qbStats", "teamEfficiency"}, allEntries = true, condition = "#result")
    public boolean replaceWeek(int season, int stage, int week, List<QbGameStatEntity> rows, List<TeamGameStatEntity> teamRows) {
        var oldQb = repository.findInScope(season, week, week).stream().sorted(Comparator.comparing(QbGameStatEntity::getRosterId)).map(QbStatsWeekWriter::values).toList();
        var newQb = rows.stream().sorted(Comparator.comparing(QbGameStatEntity::getRosterId)).map(QbStatsWeekWriter::values).toList();
        var oldTeams = teamRepository.findInScope(season, week, week).stream().sorted(Comparator.comparing(t -> t.getTeam().getId())).map(QbStatsWeekWriter::values).toList();
        var newTeams = teamRows.stream().sorted(Comparator.comparing(t -> t.getTeam().getId())).map(QbStatsWeekWriter::values).toList();
        if (oldQb.equals(newQb) && oldTeams.equals(newTeams)) return false;
        repository.deleteBySeasonIndexAndStageIndexAndWeekIndex(season, stage, week);
        teamRepository.deleteBySeasonIndexAndStageIndexAndWeekIndex(season, stage, week);
        repository.flush();
        repository.saveAll(rows);
        teamRepository.saveAll(teamRows);
        return true;
    }

    private static List<Object> values(QbGameStatEntity row) {
        return Arrays.asList(row.getSeasonIndex(), row.getStageIndex(), row.getWeekIndex(), row.getPassAtt(),
                row.getPassComp(), row.getPassYds(), row.getPassTd(), row.getPassInt(),
                row.getPassSacks(), row.getRushAtt(), row.getRushYds(), row.getRushTd(),
                row.getRushFum(), row.getTeamPasserYards(), row.getTeamNetPassYds(), row.getTeamSacks(),
                row.getTeamFumbles(), row.getTeamFumblesLost(), row.getRosterId(), row.getPlayerName(),
                row.getPasserRating(), row.getTeam().getId());
    }

    private static List<Object> values(TeamGameStatEntity row) {
        return Arrays.asList(row.getSeasonIndex(), row.getStageIndex(), row.getWeekIndex(), row.getTeam().getId(),
                row.getPassAtt(), row.getRushAtt(), row.getSacks(), row.getTotalYds(),
                row.getFirstDowns(), row.getThirdAtt(), row.getThirdConv(), row.getFourthAtt(),
                row.getFourthConv(), row.getRedZones(), row.getRedZoneTds(), row.getPassTds(),
                row.getRushTds(), row.getIntsLost(), row.getFumLost(), row.getPunts(),
                row.getFgAtt(), row.getFgMade(), row.getXpAtt(), row.getXpMade(),
                row.getTwoPtAtt(), row.getTwoPtConv());
    }
}
