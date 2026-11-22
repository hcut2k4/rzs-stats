package com.rzs.stats.playoffs;

import com.rzs.stats.config.*;
import com.rzs.stats.repository.*;
import com.rzs.stats.service.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.cache.CacheType;
import org.springframework.boot.test.autoconfigure.core.AutoConfigureCache;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.*;

import java.util.*;
import static org.assertj.core.api.Assertions.*;

@Tag("benchmark")
@EnabledIfSystemProperty(named = "playoffs.benchmark", matches = "true")
@DataJpaTest(showSql = false, properties = "playoffs.compute-deadline-ms=180000")
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@AutoConfigureCache(cacheProvider = CacheType.CAFFEINE)
@EnableCaching
@Import({CacheNames.class, ComputeGate.class, SeasonStateLoader.class, SimulationService.class, OddsService.class,
        LeverageService.class, ClinchService.class, PathService.class, ScenarioService.class, WhatIfService.class,
        OddsSnapshotService.class, EloQueryService.class, EloHistoryService.class, EloService.class,
        EloConfigService.class, OwnerChangeService.class, SyncStatusService.class})
class PlayoffComputeBenchmarkTest {
    @Autowired TeamRepository teams;
    @Autowired GameRepository games;
    @Autowired OddsSnapshotRepository snapshots;
    @Autowired SyncStatusRepository syncRows;
    @Autowired SyncStatusService sync;
    @Autowired OddsService odds;
    @Autowired OddsSnapshotService writer;
    @Autowired LeverageService leverage;
    @Autowired ClinchService clinch;
    @Autowired PathService paths;
    @Autowired WhatIfService whatIf;
    @Autowired SeasonStateLoader loader;

    @AfterEach
    void cleanup() { snapshots.deleteAll(); syncRows.deleteAll(); games.deleteAll(); teams.deleteAll(); }

    void warmChanged() {
        writer.save(odds.odds(2, "madden"));
        var key = leverage.canonicalKey(2, null);
        leverage.matrix(key.season(), key.week(), "madden");
        clinch.clinch(2, "madden");
    }

    @Test
    void countsSeedingsForADayOfSyncsPathsAndWhatIfRequests() throws Exception {
        PlayoffFixturesTest.populate(teams, games, 32);
        sync.successful(2); warmChanged();
        SimulationService.resetSeedings();
        sync.successful(2); warmChanged();
        long unchanged = SimulationService.seedings();
        var changed = games.findBySeasonIndex(2).stream().filter(g -> g.getStatus() < 2).findFirst().orElseThrow();
        changed.setStatus(2); changed.setHomeScore(24); changed.setAwayScore(17); games.save(changed);
        sync.successful(2); warmChanged();
        long changedSync = SimulationService.seedings() - unchanged;
        for (var t : loader.load(2).teams()) paths.path(2, t.abbr(), "madden");
        long pathRequests = SimulationService.seedings() - unchanged - changedSync;
        var remaining = whatIf.remaining(2).games();
        for (int i = 0; i < 20; i++) whatIf.simulate(new WhatIfService.Request(2, "madden",
                List.of(new WhatIfService.Pick(remaining.get(i).gameId(), "home")), null));
        long whatIfRequests = SimulationService.seedings() - unchanged - changedSync - pathRequests;
        assertThat(unchanged).isZero();
        assertThat(changedSync).isLessThan(360000);
        assertThat(pathRequests).isBetween(32 * 10000L, 32 * (10000L + 10 * 2 * 1500));
        assertThat(whatIfRequests).isEqualTo(20 * 20000L);
        System.out.printf("Compute diet seedings before -> after: no-change sync 360000 -> %d; changed-game sync 360000 -> %d; 32 Paths 5920000 -> %d; 20 What-If 400000 -> %d; total 7040000 -> %d%n",
                unchanged, changedSync, pathRequests, whatIfRequests, SimulationService.seedings());
    }
}
