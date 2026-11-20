package com.rzs.stats.service;

import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.model.dto.EloConfig;
import com.rzs.stats.repository.EloConfigRepository;
import com.rzs.stats.repository.GameRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EloHistoryServiceTest {
    @Mock GameRepository games;
    @Mock EloConfigRepository configs;

    private TeamEntity team(int id) {
        var t = new TeamEntity();
        t.setTeamId(id);
        return t;
    }

    private GameEntity game(int id, int season, int stage, int week) {
        var g = new GameEntity();
        g.setGameId(id);
        g.setSeasonIndex(season);
        g.setStageIndex(stage);
        g.setWeekIndex(week);
        g.setHomeTeam(team(1));
        g.setAwayTeam(team(2));
        g.setHomeScore(14);
        g.setAwayScore(7);
        g.setStatus(2);
        return g;
    }

    @Test
    void postseasonIsIncludedPreseasonExcludedAndSimmedIsIgnored() {
        var simmed = game(1, 0, 1, 17);
        simmed.setSimmed(true);
        var preseason = game(99, 0, 0, 0);
        preseason.setHomeTeam(team(99));
        when(games.findAllForElo()).thenReturn(List.of(game(5, 1, 1, 0), game(4, 0, 1, 22),
                game(3, 0, 1, 20), game(2, 0, 1, 19), game(0, 0, 1, 18), simmed, preseason));
        var timeline = new EloHistoryService(games, new EloConfigService(configs), new EloService()).getTimeline();
        assertThat(timeline.games()).extracting(r -> r.game().week()).containsExactly(17, 18, 19, 20, 22, 0);
        assertThat(timeline.history()).hasSize(12);
        assertThat(timeline.history()).noneMatch(s -> s.team().teamId() == 99);
        assertThat(timeline.games().get(1).homePregameElo()).isEqualTo(timeline.games().getFirst().homePostgameElo());
        assertThat(timeline.games().getLast().homePregameElo()).isCloseTo(1500 + (timeline.games().get(4).homePostgameElo() - 1500) * EloConfig.defaults().offseasonRetention(), within(1e-12));
        verify(games).findAllForElo();
        verifyNoMoreInteractions(games);
    }

    @Test
    void incompleteMissingAndMalformedGamesAreSkippedSafely() {
        List<GameEntity> input = new ArrayList<>();
        for (int i = 0; i < 12; i++) input.add(game(i, 0, 1, 0));
        input.get(0).setStatus(null);
        input.get(1).setStatus(1);
        input.get(2).setHomeScore(null);
        input.get(3).setAwayScore(null);
        input.get(4).setHomeTeam(null);
        input.get(5).setAwayTeam(null);
        input.get(6).setSeasonIndex(null);
        input.get(7).setWeekIndex(null);
        input.get(8).setStageIndex(null);
        input.get(9).setHomeTeam(new TeamEntity());
        input.get(10).setAwayTeam(team(1));
        input.get(11).setGameId(null);
        var scheduled = game(100, 0, 1, 2);
        scheduled.setHomeTeam(team(3));
        scheduled.setStatus(0);
        input.add(scheduled);
        input.add(game(42, 0, 1, 1));
        when(games.findAllForElo()).thenReturn(input);
        var timeline = new EloHistoryService(games, new EloConfigService(configs), new EloService()).getTimeline();
        assertThat(timeline.games()).hasSize(1);
        assertThat(timeline.history()).hasSize(3);
        assertThat(timeline.history()).allMatch(s -> s.week() == 1);
        assertThat(timeline.history().getLast().gamesCounted()).isZero();
    }

    @Test
    void emptyDataProducesEmptyTimeline() {
        when(games.findAllForElo()).thenReturn(List.of());
        var timeline = new EloHistoryService(games, new EloConfigService(configs), new EloService()).getTimeline();
        assertThat(timeline.history()).isEmpty();
        assertThat(timeline.games()).isEmpty();
    }
}
