package com.rzs.stats.service;

import com.rzs.stats.model.entity.QbGameStatEntity;
import com.rzs.stats.model.entity.TeamEntity;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class QbStatsCalculatorTest {
    private final QbStatsCalculator calculator = new QbStatsCalculator();

    static QbGameStatEntity row(String id, int week, int attempts, int yards) {
        TeamEntity team = new TeamEntity();
        team.setAbbrName("AAA");
        team.setDisplayName("Team A");
        QbGameStatEntity row = new QbGameStatEntity();
        row.setRosterId(id);
        row.setPlayerName("Player " + id);
        row.setTeam(team);
        row.setStageIndex(1);
        row.setWeekIndex(week);
        row.setPassAtt(attempts);
        row.setPassYds(yards);
        return row;
    }

    @Test
    void calculatesKnownTotalsWithoutRoundingAllocations() {
        var row = row("a", 0, 30, 300);
        row.setPassComp(20);
        row.setPassTd(3);
        row.setPassInt(1);
        row.setPassSacks(2);
        row.setTeamSacks(3);
        row.setTeamPasserYards(350);
        row.setTeamNetPassYds(330);
        row.setRushAtt(5);
        row.setRushYds(40);
        row.setRushTd(1);
        row.setRushFum(1);
        row.setTeamFumbles(3);
        row.setTeamFumblesLost(1);
        var d = calculator.calculate(List.of(row));
        assertThat(d.sackYardsLost).isCloseTo(40.0 / 3, within(1e-12));
        assertThat(d.fumblesLost).isCloseTo(1.0 / 3, within(1e-12));
        assertThat(d.tanya).isCloseTo((300 - 40.0 / 3 + 40 + 80 - 60) / 37, within(1e-12));
        assertThat(d.anya).isCloseTo((300 - 40.0 / 3 + 60 - 45) / 32, within(1e-12));
        assertThat(d.rushValue).isCloseTo((40 - 20 + 20 - 45.0 / 3) / 32, within(1e-12));
        assertThat(d.tdPct).isEqualTo(0.1);
        assertThat(d.intPct).isEqualTo(1.0 / 30);
        assertThat(d.tdToInt).isEqualTo(3.0);
    }

    @Test
    void zeroRushingChargesTheFumblePenaltyToRushValue() {
        var row = row("a", 0, 20, 200);
        row.setRushFum(1);
        row.setTeamFumbles(1);
        row.setTeamFumblesLost(1);
        var d = calculator.calculate(List.of(row));
        assertThat(d.rushValue).isEqualTo(-45.0 / 20);
        assertThat(d.anya).isEqualTo(10.0);
    }

    @Test
    void rushValueIsPositiveAboveTheFourYardBaselineAndNegativeBelowIt() {
        var good = row("a", 0, 20, 200);
        good.setRushAtt(10);
        good.setRushYds(90);
        good.setRushTd(2);
        var bad = row("b", 0, 20, 200);
        bad.setRushAtt(10);
        bad.setRushYds(15);
        assertThat(calculator.calculate(List.of(good)).rushValue).isEqualTo((90 - 40 + 40) / 20.0);
        assertThat(calculator.calculate(List.of(bad)).rushValue).isEqualTo((15 - 40) / 20.0);
    }

    @Test
    void rushValueKeepsFractionalFumblesLostUnrounded() {
        var row = row("a", 0, 30, 300);
        row.setRushAtt(4);
        row.setRushYds(16);
        row.setRushFum(2);
        row.setTeamFumbles(3);
        row.setTeamFumblesLost(1);
        var d = calculator.calculate(List.of(row));
        assertThat(d.fumblesLost).isCloseTo(2.0 / 3, within(1e-12));
        assertThat(d.rushValue).isCloseTo((16 - 16 - 45 * (2.0 / 3)) / 30, within(1e-12));
    }

    @Test
    void rushValueAggregatesSeasonTotalsInsteadOfAveragingGames() {
        var a = row("a", 0, 10, 100);
        a.setRushAtt(2);
        a.setRushYds(40);
        var b = row("a", 1, 30, 300);
        b.setRushAtt(10);
        b.setRushYds(10);
        var total = calculator.calculate(List.of(a, b));
        assertThat(total.rushValue).isEqualTo((50 - 48) / 40.0);
        assertThat(total.rushValue).isNotEqualTo(
                (calculator.calculate(List.of(a)).rushValue + calculator.calculate(List.of(b)).rushValue) / 2);
    }

    @Test
    void multiQuarterbackAllocationsSumToTeamSackYardsAndLostFumbles() {
        var a = row("a", 0, 20, 200);
        var b = row("b", 0, 10, 100);
        for (var r : List.of(a, b)) {
            r.setTeamPasserYards(300);
            r.setTeamNetPassYds(275);
            r.setTeamSacks(3);
            r.setTeamFumbles(3);
            r.setTeamFumblesLost(2);
        }
        a.setPassSacks(1);
        b.setPassSacks(2);
        a.setRushFum(2);
        b.setRushFum(1);
        assertThat(calculator.sackYardsLost(a)).isCloseTo(25.0 / 3, within(1e-12));
        assertThat(calculator.sackYardsLost(b)).isCloseTo(50.0 / 3, within(1e-12));
        assertThat(calculator.sackYardsLost(a) + calculator.sackYardsLost(b)).isCloseTo(25.0, within(1e-12));
        assertThat(calculator.fumblesLost(a)).isCloseTo(4.0 / 3, within(1e-12));
        assertThat(calculator.fumblesLost(b)).isCloseTo(2.0 / 3, within(1e-12));
        assertThat(calculator.fumblesLost(a) + calculator.fumblesLost(b)).isEqualTo(2.0);
    }

    @Test
    void negativeReconstructedSackYardsAndZeroTeamSacksReturnZero() {
        var row = row("a", 0, 10, 100);
        row.setPassSacks(2);
        row.setTeamSacks(2);
        row.setTeamPasserYards(100);
        row.setTeamNetPassYds(110);
        assertThat(calculator.sackYardsLost(row)).isZero();
        row.setTeamNetPassYds(50);
        row.setTeamSacks(0);
        assertThat(calculator.sackYardsLost(row)).isZero();
    }

    @Test
    void fumbleLossRatioCapsAtOneAndZeroFumblesReturnsZero() {
        var row = row("a", 0, 10, 100);
        row.setRushFum(2);
        row.setTeamFumbles(3);
        row.setTeamFumblesLost(7);
        assertThat(calculator.fumblesLost(row)).isEqualTo(2.0);
        row.setTeamFumbles(0);
        assertThat(calculator.fumblesLost(row)).isZero();
    }

    @Test
    void seasonRatesDivideSummedTotalsInsteadOfAveragingGames() {
        var a = row("a", 0, 10, 200);
        var b = row("a", 1, 50, 100);
        var total = calculator.calculate(List.of(a, b));
        assertThat(total.tanya).isEqualTo(5.0);
        assertThat(total.tanya).isNotEqualTo((calculator.calculate(List.of(a)).tanya + calculator.calculate(List.of(b)).tanya) / 2);
        assertThat(total.anya).isEqualTo(5.0);
    }

    @Test
    void zeroDenominatorsReturnNull() {
        var d = calculator.calculate(List.of(row("a", 0, 0, 0)));
        assertThat(d.tanya).isNull();
        assertThat(d.rushValue).isNull();
        assertThat(d.anya).isNull();
        assertThat(d.passerRating).isNull();
        assertThat(d.tdPct).isNull();
        assertThat(d.intPct).isNull();
        assertThat(d.tdToInt).isNull();
        assertThat(d.rushYdsPerAtt).isNull();
    }
}
