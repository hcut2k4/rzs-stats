package com.rzs.stats.repository;

import com.rzs.stats.model.entity.QbGameStatEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.service.QbStatsWeekWriter;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@Import(QbStatsWeekWriter.class)
class QbStatsPersistenceTest {
    @Autowired QbGameStatRepository repository;
    @Autowired TeamRepository teams;
    @Autowired QbStatsWeekWriter writer;

    private QbGameStatEntity row(int week, int yards) {
        TeamEntity team = teams.findByTeamId(1).orElseGet(() -> {
            var t = new TeamEntity();
            t.setTeamId(1);
            t.setAbbrName("AAA");
            return teams.save(t);
        });
        var row = new QbGameStatEntity();
        row.setRosterId("123");
        row.setPlayerName("Quarterback");
        row.setTeam(team);
        row.setSeasonIndex(0);
        row.setStageIndex(1);
        row.setWeekIndex(week);
        row.setPassYds(yards);
        return row;
    }

    @Test
    void replacingWeekUpdatesUniquePlayerGameAndPreservesOtherWeeks() {
        writer.replaceWeek(0, 1, 0, List.of(row(0, 100)));
        writer.replaceWeek(0, 1, 1, List.of(row(1, 200)));
        writer.replaceWeek(0, 1, 0, List.of(row(0, 300)));
        repository.flush();
        assertThat(repository.findInScope(0, 0, 17)).extracting(QbGameStatEntity::getPassYds).containsExactly(300, 200);
        assertThat(repository.existsBySeasonIndexAndStageIndexAndWeekIndex(0, 1, 0)).isTrue();
    }

    @Test
    void scopeQueriesSeparatePlayoffsAndExcludePreseason() {
        var preseason = row(0, 50);
        preseason.setStageIndex(0);
        repository.saveAll(List.of(preseason, row(17, 100), row(18, 200), row(22, 300)));
        repository.flush();
        assertThat(repository.findInScope(null, 0, 17)).extracting(QbGameStatEntity::getPassYds).containsExactly(100);
        assertThat(repository.findProfile("123", 18, 22)).extracting(QbGameStatEntity::getPassYds).containsExactly(200, 300);
    }
}
