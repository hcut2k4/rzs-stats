package com.rzs.stats.repository;

import com.rzs.stats.client.NeonSportzClient;
import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.model.ns.NsLeague;
import com.rzs.stats.model.ns.NsTeam;
import com.rzs.stats.service.SyncService;
import jakarta.persistence.EntityManager;
import com.rzs.stats.model.entity.TeamGameStatEntity;
import com.rzs.stats.model.entity.QbGameStatEntity;
import com.rzs.stats.service.QbStatsWeekWriter;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;

@DataJpaTest
@Import(QbStatsWeekWriter.class)
class TeamGamePersistenceTest {
    @Autowired TeamGameStatRepository repository;
    @Autowired QbGameStatRepository qbs;
    @Autowired TeamRepository teams;
    @Autowired GameRepository games;
    @Autowired EntityManager entityManager;
    @Autowired QbStatsWeekWriter writer;

    private TeamEntity team() {
        return teams.findByTeamId(1).orElseGet(() -> {
            var t = new TeamEntity();
            t.setTeamId(1);
            t.setAbbrName("AAA");
            return teams.save(t);
        });
    }

    private TeamGameStatEntity row(int season, int stage, int week, int yards) {
        var r = new TeamGameStatEntity();
        r.setTeam(team());
        r.setSeasonIndex(season);
        r.setStageIndex(stage);
        r.setWeekIndex(week);
        r.setTotalYds(yards);
        return r;
    }

    private QbGameStatEntity qb(int week, int yards) {
        var r = new QbGameStatEntity();
        r.setRosterId("123");
        r.setPlayerName("Quarterback");
        r.setTeam(team());
        r.setStageIndex(1);
        r.setWeekIndex(week);
        r.setPassYds(yards);
        return r;
    }

    @Test
    void leagueReplacementPurgesDependentStatsAndGamesBeforeReplacingTeams() {
        var oldTeam = team();
        var oldGame = new GameEntity();
        oldGame.setGameId(100);
        oldGame.setSeasonIndex(0);
        oldGame.setHomeTeam(oldTeam);
        oldGame.setAwayTeam(oldTeam);
        games.saveAndFlush(oldGame);
        qbs.saveAndFlush(qb(0, 100));
        repository.saveAndFlush(row(0, 1, 0, 150));
        assertThat(games.count()).isEqualTo(1);
        assertThat(qbs.count()).isEqualTo(1);
        assertThat(repository.count()).isEqualTo(1);

        var client = mock(NeonSportzClient.class);
        var league = new NsLeague();
        league.setSeason(0);
        var replacement = new NsTeam();
        replacement.setTeamId(999);
        replacement.setAbbrName("NEW");
        when(client.fetchLeagueInfo()).thenReturn(league);
        when(client.fetchAllTeams()).thenReturn(List.of(replacement));
        when(client.fetchAllGamesForSeason(0)).thenReturn(List.of());
        var sync = new SyncService(client, teams, games, qbs, repository, org.mockito.Mockito.mock(com.rzs.stats.service.SyncStatusService.class));

        var result = sync.sync();

        assertThat(result.success()).as(result.message()).isTrue();
        assertThat(qbs.count()).isZero();
        assertThat(repository.count()).isZero();
        assertThat(games.count()).isZero();
        assertThat(teams.findAll()).extracting(TeamEntity::getTeamId).containsExactly(999);
        entityManager.clear();
        assertThat(teams.findById(oldTeam.getId())).isEmpty();
    }

    @Test
    void scopeSelectsOnlyTheSeasonAndInclusiveRegularOrPlayoffWeeks() {
        repository.saveAllAndFlush(List.of(row(0, 0, 0, 50), row(1, 1, 17, 99),
                row(0, 1, 0, 100), row(0, 1, 17, 200), row(0, 1, 18, 300),
                row(0, 1, 22, 400), row(0, 1, 23, 500)));
        assertThat(repository.findInScope(0, 0, 17)).extracting(TeamGameStatEntity::getTotalYds).containsExactly(100, 200);
        assertThat(repository.findInScope(0, 18, 22)).extracting(TeamGameStatEntity::getTotalYds).containsExactly(300, 400);
        assertThat(repository.findInScope(0, 0, 22)).hasSize(4);
        assertThat(repository.findInScope(1, 0, 22)).extracting(TeamGameStatEntity::getTotalYds).containsExactly(99);
    }

    @Test
    void replacingAWeekUpdatesBothStatSetsAndPreservesOtherWeeks() {
        writer.replaceWeek(0, 1, 0, List.of(qb(0, 100)), List.of(row(0, 1, 0, 150)));
        writer.replaceWeek(0, 1, 1, List.of(qb(1, 200)), List.of(row(0, 1, 1, 250)));
        writer.replaceWeek(0, 1, 0, List.of(qb(0, 300)), List.of(row(0, 1, 0, 350)));
        repository.flush();
        assertThat(qbs.findInScope(0, 0, 17)).extracting(QbGameStatEntity::getPassYds).containsExactly(300, 200);
        assertThat(repository.findInScope(0, 0, 17)).extracting(TeamGameStatEntity::getTotalYds).containsExactly(350, 250);
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void failedWeekReplacementPreservesPreviouslyStoredQbAndTeamStats() {
        try {
            qbs.saveAndFlush(qb(0, 100));
            repository.saveAndFlush(row(0, 1, 0, 150));
            var qbId = qbs.findInScope(0, 0, 0).get(0).getId();
            var teamStatId = repository.findInScope(0, 0, 0).get(0).getId();

            assertThatThrownBy(() -> writer.replaceWeek(0, 1, 0, List.of(qb(0, 300)),
                    List.of(row(0, 1, 0, 350), row(0, 1, 0, 400))))
                    .isInstanceOf(DataIntegrityViolationException.class);

            assertThat(qbs.findInScope(0, 0, 0)).singleElement().satisfies(r -> {
                assertThat(r.getId()).isEqualTo(qbId);
                assertThat(r.getPassYds()).isEqualTo(100);
            });
            assertThat(repository.findInScope(0, 0, 0)).singleElement().satisfies(r -> {
                assertThat(r.getId()).isEqualTo(teamStatId);
                assertThat(r.getTotalYds()).isEqualTo(150);
            });
        } finally {
            qbs.deleteAllInBatch();
            repository.deleteAllInBatch();
            teams.deleteAllInBatch();
        }
    }

    @Test
    void duplicateTeamGameIsRejected() {
        repository.saveAndFlush(row(0, 1, 0, 100));
        assertThatThrownBy(() -> repository.saveAndFlush(row(0, 1, 0, 200)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
