package com.rzs.stats.playoffs;

import com.rzs.stats.config.CacheNames;
import com.rzs.stats.repository.OddsSnapshotRepository;
import com.rzs.stats.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.cache.CacheType;
import org.springframework.boot.test.autoconfigure.core.AutoConfigureCache;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;
import java.util.List;
import static org.assertj.core.api.Assertions.*;

@DataJpaTest(showSql = false)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@AutoConfigureCache(cacheProvider = CacheType.CAFFEINE)
@Import({CacheNames.class, OddsSnapshotService.class, SyncStatusService.class, EloConfigService.class})
class BackfillTransactionTest {
    @Autowired OddsSnapshotService writer;
    @Autowired OddsSnapshotRepository rows;

    @AfterEach
    void clear() { rows.deleteAll(); }

    @Test
    void backfillComputesOutsideTransactionAndSkipsExistingSnapshots() {
        var team = new EloService.Team(1, "A", "A");
        var row = new OddsService.Row(team, "East", 0, 0, 0, new OddsService.Odds(.5, .2, .1),
                List.of(.1, .1, .1, .1, .1, .0, .0));
        boolean created = writer.saveIfAbsent(2, 0, () -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            assertThat(Thread.holdsLock(writer)).isFalse();
            return new OddsService.Response(2, "madden", null, 0, 100, Instant.EPOCH,
                    List.of(new OddsService.Conference("AFC", List.of(row))));
        });
        assertThat(created).isTrue();
        assertThat(rows.findBySeasonAndNextWeek(2, 0)).hasSize(1);
        assertThat(writer.saveIfAbsent(2, 0, () -> { throw new AssertionError("Existing snapshot must skip compute"); })).isFalse();
    }
}
