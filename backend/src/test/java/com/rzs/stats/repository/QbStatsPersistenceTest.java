package com.rzs.stats.repository;

import com.rzs.stats.model.entity.QbGameStatEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.service.QbStatsWeekWriter;
import com.rzs.stats.service.QbStatsService;
import com.rzs.stats.service.QbStatsCalculator;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@Import({QbStatsWeekWriter.class, QbStatsService.class, QbStatsCalculator.class})
class QbStatsPersistenceTest {
    @Autowired QbGameStatRepository repository;
    @Autowired TeamRepository teams;
    @Autowired QbStatsWeekWriter writer;
    @Autowired QbStatsService stats;

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
    void weeklyRanksHaveNoMovementWhileSeasonRanksRetainMovement() {
        var a0 = row(0, 400);
        var b0 = row(0, 200);
        var a1 = row(1, 0);
        var b1 = row(1, 600);
        a0.setRosterId("a");
        a1.setRosterId("a");
        b0.setRosterId("b");
        b1.setRosterId("b");
        for (var stat : List.of(a0, b0, a1, b1)) stat.setPassAtt(20);
        repository.saveAllAndFlush(List.of(a0, b0, a1, b1));

        var weekly = stats.leaderboard(QbStatsService.Scope.WEEK, 0, 1, QbStatsService.Stage.REGULAR, null, true);
        assertThat(weekly).extracting(d -> d.rosterId).containsExactly("b", "a");
        assertThat(weekly).extracting(d -> d.rank).containsExactly(1, 2);
        assertThat(weekly).allSatisfy(d -> assertThat(d.rankChange).isNull());
        var season = stats.leaderboard(QbStatsService.Scope.SEASON, 0, 1, QbStatsService.Stage.REGULAR, null, false);
        assertThat(season).extracting(d -> d.rosterId).containsExactly("b", "a");
        assertThat(season).extracting(d -> d.rankChange).containsExactly(1, -1);
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
        assertThat(repository.findInScope(null, 18, 22)).extracting(QbGameStatEntity::getPassYds).containsExactly(200, 300);
    }
}
