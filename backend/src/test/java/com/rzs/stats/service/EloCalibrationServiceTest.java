package com.rzs.stats.service;

import com.rzs.stats.model.dto.EloConfig;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class EloCalibrationServiceTest {
    @ParameterizedTest
    @CsvSource({"0,0", "0.099999,0", "0.1,1", "0.2,2", "0.3,3", "0.4,4",
            "0.5,5", "0.6,6", "0.7,7", "0.8,8", "0.9,9", "1.0,9"})
    void boundariesStartTheUpperBucketAndOneBelongsToTheLast(double probability, int bucket) {
        var history = mock(EloHistoryService.class);
        var game = new EloService.Game(1, 1L, 0, 1, 0,
                new EloService.Team(1, "A", "Alpha"), new EloService.Team(2, "B", "Beta"), 7, 0);
        var result = new EloService.Result(game, 1500, 1500, probability, 1 - probability, 7, 1, 0, 1500, 1500);
        when(history.getTimeline()).thenReturn(new EloService.Timeline(EloConfig.defaults(), List.of(), List.of(result)));

        var report = new EloCalibrationService(history).report(null);

        assertThat(report.games()).isEqualTo(1);
        assertThat(report.buckets()).containsExactly(new EloCalibrationService.Bucket(
                bucket / 10.0, (bucket + 1) / 10.0, 1, probability, 1));
    }
}
