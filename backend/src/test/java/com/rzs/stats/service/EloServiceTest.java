package com.rzs.stats.service;

import com.rzs.stats.model.dto.EloConfig;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class EloServiceTest {
    private final EloService engine = new EloService();
    private final EloConfig config = EloConfig.defaults();
    private final EloService.Team a = new EloService.Team(1, "A", "Alpha");
    private final EloService.Team b = new EloService.Team(2, "B", "Beta");
    private final EloService.Team c = new EloService.Team(3, "C", "Gamma");
    private final EloService.Team d = new EloService.Team(4, "D", "Delta");

    private EloService.Game game(int id, int season, int week, EloService.Team home, EloService.Team away, int hs, int as) {
        return new EloService.Game(id, (long) id, season, 1, week, home, away, hs, as);
    }

    @ParameterizedTest
    @CsvSource({"1,8.7", "7,26.0", "14,33.9", "21,38.6", "35,38.6"})
    void equalTeamsMatchWorkedTable(int margin, double expected) {
        var result = engine.play(game(1, 0, 0, a, b, margin, 0), 1500, 1500, config);
        assertThat(Math.round(result.pointsMoved() * 10) / 10.0).isEqualTo(expected);
        assertThat(result.homePostgameElo() + result.awayPostgameElo()).isEqualTo(3000);
        assertThat(result.movMultiplier()).isCloseTo(Math.log1p(Math.min(margin, 21)), within(1e-12));
    }

    @Test
    void strongerTeamsHaveHigherProbabilityAndUpsetsMoveMorePoints() {
        assertThat(engine.probability(1600, 1500, config)).isCloseTo(0.640065, within(0.000001));
        var win = engine.play(game(1, 0, 0, a, b, 14, 0), 1600, 1500, config);
        var upset = engine.play(game(1, 0, 0, a, b, 0, 14), 1600, 1500, config);
        assertThat(-upset.pointsMoved()).isGreaterThan(win.pointsMoved());
        assertThat(upset.movMultiplier()).isGreaterThan(win.movMultiplier());
        assertThat(win.homePostgameElo() - 1600).isCloseTo(1500 - win.awayPostgameElo(), within(1e-12));
    }

    @Test
    void tiesUseUnitMultiplierAndMoveUnequalRatingsTowardEachOther() {
        var result = engine.play(game(1, 0, 0, a, b, 7, 7), 1600, 1500, config);
        assertThat(result.movMultiplier()).isEqualTo(1);
        assertThat(result.pointsMoved()).isCloseTo(25 * (0.5 - result.homeWinProbability()), within(1e-12));
        assertThat(result.pointsMoved()).isNegative();
    }

    @Test
    void homeAdvantageOnlyAffectsProbabilityAndMovCanBeDisabled() {
        var custom = new EloConfig(1500, 25, 400, false, 21, 100, 0.9);
        var result = engine.play(game(1, 0, 0, a, b, 35, 0), 1500, 1500, custom);
        assertThat(result.movMultiplier()).isEqualTo(1);
        assertThat(result.homeWinProbability()).isEqualTo(engine.probability(1600, 1500, custom));
        assertThat(result.homePostgameElo() + result.awayPostgameElo()).isEqualTo(3000);
        assertThat(result.homePostgameElo()).isCloseTo(1500 + 25 * (1 - result.homeWinProbability()), within(1e-12));
    }

    @Test
    void invalidMovDenominatorsFallBackToFiniteUnitMultiplier() {
        var result = engine.play(game(1, 0, 0, a, b, 7, 0), -1000, 1500, config);
        assertThat(result.movMultiplier()).isEqualTo(1);
        assertThat(result.pointsMoved()).isFinite();
    }

    @ParameterizedTest
    @CsvSource({"1750,1725", "1600,1590", "1500,1500", "1400,1410", "1250,1275"})
    void regressionRetainsNinetyPercentOfDeviation(double before, double after) {
        assertThat(engine.regress(before, config)).isEqualTo(after);
    }

    @Test
    void timelineStartsAllTeamsAtInitialRatingAndByesRemainUnchanged() {
        var timeline = engine.compute(List.of(game(1, 0, 0, a, b, 7, 0), game(2, 0, 1, a, c, 7, 0)), List.of(a, b, c), config);
        assertThat(timeline.history().subList(0, 3)).allSatisfy(s -> assertThat(s.startElo()).isEqualTo(1500));
        var bye = timeline.history().stream().filter(s -> s.week() == 1 && s.team().equals(b)).findFirst().orElseThrow();
        assertThat(bye.change()).isZero();
        assertThat(bye.startElo()).isEqualTo(bye.endElo());
        assertThat(bye.gamesCounted()).isEqualTo(1);
    }

    @Test
    void regressionRunsOnceAtEachSeasonBoundaryWithoutWeeklyDecay() {
        var timeline = engine.compute(List.of(game(1, 0, 17, a, b, 7, 0), game(2, 0, 18, a, b, 7, 0),
                game(3, 1, 0, c, d, 0, 0), game(4, 1, 1, c, d, 0, 0), game(5, 2, 0, c, d, 0, 0)), List.of(), config);
        var rows = timeline.history().stream().filter(s -> s.team().equals(a)).toList();
        assertThat(rows.get(1).startElo()).isEqualTo(rows.get(0).endElo());
        assertThat(rows.get(2).startElo()).isEqualTo(engine.regress(rows.get(1).endElo(), config));
        assertThat(rows.get(2).seasonStart()).isTrue();
        assertThat(rows.get(2).change()).isZero();
        assertThat(rows.get(3).startElo()).isEqualTo(rows.get(2).endElo());
        assertThat(rows.get(3).seasonStart()).isFalse();
        assertThat(rows.get(4).startElo()).isEqualTo(engine.regress(rows.get(3).endElo(), config));
    }

    @Test
    void repeatedInputsAreDeterministicAndDuplicatesAreCountedOnce() {
        var g = game(1, 0, 0, a, b, 7, 0);
        var expected = engine.compute(List.of(g), List.of(), config);
        assertThat(engine.compute(List.of(g, g), List.of(), config)).isEqualTo(expected);
        assertThat(engine.compute(List.of(g), List.of(), config)).isEqualTo(expected);
        assertThatThrownBy(() -> expected.history().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> expected.games().clear()).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void normalWeekUsesStartRatingsRegardlessOfProcessingOrder() {
        var first = game(1, 0, 0, a, b, 7, 0);
        var second = game(2, 0, 0, c, d, 14, 0);
        var reversedIds = List.of(game(2, 0, 0, a, b, 7, 0), game(1, 0, 0, c, d, 14, 0));
        var normal = engine.compute(List.of(first, second), List.of(), config);
        assertThat(engine.compute(reversedIds, List.of(), config).history()).isEqualTo(normal.history());
        assertThat(normal.games()).allSatisfy(r -> {
            assertThat(r.homePregameElo()).isEqualTo(1500);
            assertThat(r.awayPregameElo()).isEqualTo(1500);
        });
    }

    @Test
    void multipleGamesForOneTeamUseChronologicalPregameRatings() {
        var early = game(1, 0, 0, a, b, 7, 0);
        var later = game(2, 0, 0, c, a, 0, 14);
        var next = game(3, 0, 1, b, c, 7, 0);
        var timeline = engine.compute(List.of(next, later, early), List.of(), config);
        assertThat(timeline.games()).extracting(r -> r.game().gameId()).containsExactly(1, 2, 3);
        assertThat(timeline.games().get(1).awayPregameElo()).isEqualTo(timeline.games().getFirst().homePostgameElo());
        assertThat(timeline.history().stream().filter(s -> s.team().equals(a)).findFirst().orElseThrow().gamesCounted()).isEqualTo(2);
    }

    @Test
    void equalRatingsBreakRankTiesByTeamId() {
        var timeline = engine.compute(List.of(game(1, 0, 0, b, a, 0, 0)), List.of(c), config);
        assertThat(timeline.history()).extracting(EloService.Snapshot::rank).containsExactly(1, 2, 3);
        assertThat(timeline.history()).extracting(s -> s.team().teamId()).containsExactly(1, 2, 3);
    }
}
