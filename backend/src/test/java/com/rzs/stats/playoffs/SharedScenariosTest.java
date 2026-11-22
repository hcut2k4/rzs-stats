package com.rzs.stats.playoffs;

import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class SharedScenariosTest {
    @Test
    void sharedEnumerationPreservesEveryTeamsConditionsUnderBothRules() throws Exception {
        var completed = SimulationServiceTest.season(true);
        int split = completed.completedGames().size() - 3;
        var remaining = new ArrayList<SeasonStateLoader.RemainingGame>();
        int id = 1;
        for (var g : completed.completedGames().subList(split, completed.completedGames().size()))
            remaining.add(new SeasonStateLoader.RemainingGame(id++, g.week(), g.home(), g.away(), 0, 0));
        var identities = new HashMap<String, com.rzs.stats.service.EloService.Team>();
        for (var team : completed.teams()) identities.put(team.abbr(), new com.rzs.stats.service.EloService.Team(identities.size(), team.abbr(), team.abbr()));
        var state = new SeasonStateLoader.State(2, completed.teams(), identities, completed.completedGames().subList(0, split), remaining, 16, 17);
        try (var gate = new ComputeGate(2, 100)) {
            var service = new ScenarioService(new org.springframework.cache.concurrent.ConcurrentMapCacheManager(), gate);
            var old = new LegacyScenarioService();
            for (String rules : List.of("madden", "nfl")) {
                long before = SimulationService.seedings();
                for (var team : state.teams())
                    assertThat(service.scenarios(state, team.abbr(), rules)).usingRecursiveComparison()
                            .isEqualTo(old.scenarios(state, team.abbr(), rules));
                assertThat(SimulationService.seedings() - before).isEqualTo(8);
            }
        }
    }
}
