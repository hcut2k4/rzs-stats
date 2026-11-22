package com.rzs.stats.repository;

import com.rzs.stats.model.dto.EloConfig;
import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.service.EloConfigService;
import jakarta.persistence.EntityManager;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import static org.assertj.core.api.Assertions.*;

@DataJpaTest
@Import({EloConfigService.class, com.rzs.stats.config.CacheNames.class})
class EloPersistenceTest {
    @Autowired GameRepository games;
    @Autowired TeamRepository teams;
    @Autowired EloConfigRepository configs;
    @Autowired EloConfigService service;
    @Autowired EntityManager em;

    @Test
    void defaultsAreSeededOnceAndUpdatesPersistInOneRow() {
        service.seed();
        service.seed();
        assertThat(configs.count()).isEqualTo(1);
        assertThat(service.get()).isEqualTo(EloConfig.defaults());
        var custom = new EloConfig(1400, 30, 500, false, 14, 50, 0.8);
        service.update(custom);
        em.flush();
        em.clear();
        assertThat(service.get()).isEqualTo(custom);
        service.seed();
        assertThat(configs.count()).isEqualTo(1);
        assertThat(service.get()).isEqualTo(custom);
    }

    @Test
    void eloQueryLoadsEveryGameAndBothTeamsInOneStatement() {
        for (int i = 0; i < 4; i++) {
            var home = new TeamEntity(); home.setTeamId(i * 2 + 1); home.setDisplayName("Home" + i);
            var away = new TeamEntity(); away.setTeamId(i * 2 + 2); away.setDisplayName("Away" + i);
            teams.save(home); teams.save(away);
            var game = new GameEntity(); game.setGameId(i); game.setSeasonIndex(i / 2);
            game.setStageIndex(i == 0 ? 0 : 1); game.setWeekIndex(i == 3 ? 22 : 0);
            game.setStatus(i == 1 ? 0 : 2); game.setHomeTeam(home); game.setAwayTeam(away);
            games.save(game);
        }
        em.flush();
        em.clear();
        var statistics = em.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics();
        statistics.setStatisticsEnabled(true);
        statistics.clear();
        try {
            var loaded = games.findAllForElo();
            assertThat(loaded).hasSize(4);
            loaded.forEach(g -> {
                assertThat(g.getHomeTeam().getDisplayName()).startsWith("Home");
                assertThat(g.getAwayTeam().getDisplayName()).startsWith("Away");
            });
            assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
        } finally {
            statistics.setStatisticsEnabled(false);
        }
    }
}
