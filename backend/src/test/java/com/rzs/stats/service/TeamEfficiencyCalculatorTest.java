package com.rzs.stats.service;

import com.rzs.stats.model.entity.TeamGameStatEntity;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class TeamEfficiencyCalculatorTest {
    private final TeamEfficiencyCalculator calculator = new TeamEfficiencyCalculator();

    @Test
    void attributesOnlyTheOffensiveShareOfExtraPoints() {
        var row = new TeamGameStatEntity();
        row.setPassTds(4);
        row.setRushTds(2);
        row.setXpAtt(7);
        row.setXpMade(7);
        row.setFgMade(2);
        assertThat(calculator.offensivePoints(row)).isEqualTo(42 + 3 * 2);
    }

    @Test
    void creditsEveryExtraPointWhenAttemptsEqualOffensiveTouchdowns() {
        var row = new TeamGameStatEntity();
        row.setPassTds(3);
        row.setXpAtt(3);
        row.setXpMade(2);
        assertThat(calculator.offensivePoints(row)).isEqualTo(20);
    }

    @Test
    void zeroConversionAttemptsContributeNoExtraPoints() {
        var row = new TeamGameStatEntity();
        row.setRushTds(2);
        row.setXpMade(1);
        row.setTwoPtConv(1);
        assertThat(calculator.offensivePoints(row)).isEqualTo(12);
    }

    @Test
    void successfulTwoPointConversionsCountTwice() {
        var row = new TeamGameStatEntity();
        row.setRushTds(3);
        row.setXpAtt(1);
        row.setXpMade(1);
        row.setTwoPtAtt(2);
        row.setTwoPtConv(2);
        assertThat(calculator.offensivePoints(row)).isEqualTo(23);
        row.setTwoPtAtt(3);
        assertThat(calculator.offensivePoints(row)).isEqualTo(18 + 5 * 3.0 / 4);
    }

    @Test
    void countsDrivesByTheirEndingAndPlaysIncludeSacks() {
        var row = new TeamGameStatEntity();
        row.setPassTds(2);
        row.setRushTds(1);
        row.setFgAtt(2);
        row.setPunts(4);
        row.setIntsLost(1);
        row.setFumLost(1);
        row.setFourthAtt(3);
        row.setFourthConv(1);
        row.setPassAtt(30);
        row.setRushAtt(20);
        row.setSacks(3);
        assertThat(calculator.drives(row)).isEqualTo(13);
        assertThat(calculator.plays(row)).isEqualTo(53);
        row.setFourthConv(4);
        assertThat(calculator.drives(row)).isEqualTo(11);
    }

    @Test
    void seasonRatesDivideSummedComponentsInsteadOfAveragingGames() {
        var a = new TeamGameStatEntity();
        a.setPassTds(1);
        a.setXpAtt(1);
        a.setXpMade(1);
        a.setPunts(1);
        a.setPassAtt(8);
        a.setRushAtt(1);
        a.setSacks(1);
        a.setTotalYds(100);
        a.setFirstDowns(3);
        a.setThirdAtt(2);
        a.setThirdConv(1);
        a.setRedZones(1);
        a.setRedZoneTds(1);
        var b = new TeamGameStatEntity();
        b.setFgAtt(1);
        b.setFgMade(1);
        b.setPunts(5);
        b.setIntsLost(1);
        b.setFumLost(1);
        b.setPassAtt(30);
        b.setRushAtt(7);
        b.setSacks(3);
        b.setTotalYds(200);
        b.setFirstDowns(9);
        b.setThirdAtt(8);
        b.setThirdConv(2);
        b.setRedZones(3);
        b.setRedZoneTds(1);
        var totals = new TeamEfficiencyCalculator.Totals();
        calculator.add(totals, a);
        calculator.add(totals, b);
        var side = calculator.side(totals);
        assertThat(side.drives()).isEqualTo(10);
        assertThat(side.plays()).isEqualTo(50);
        assertThat(side.pointsPerDrive()).isEqualTo(10.0 / 10);
        assertThat(side.pointsPerPlay()).isEqualTo(10.0 / 50);
        assertThat(side.yardsPerPlay()).isEqualTo(300.0 / 50);
        assertThat(side.seriesRate()).isEqualTo(13.0 / 22);
        assertThat(side.thirdDownRate()).isEqualTo(3.0 / 10);
        assertThat(side.redZoneTdRate()).isEqualTo(2.0 / 4);
        assertThat(side.giveawayRate()).isEqualTo(2.0 / 10);
        assertThat(side.sackRate()).isEqualTo(4.0 / 42);
    }

    @Test
    void everyRateIsNullWithoutAnyTotals() {
        var side = calculator.side(new TeamEfficiencyCalculator.Totals());
        assertThat(side.drives()).isZero();
        assertThat(side.plays()).isZero();
        assertThat(side.pointsPerDrive()).isNull();
        assertThat(side.pointsPerPlay()).isNull();
        assertThat(side.yardsPerPlay()).isNull();
        assertThat(side.seriesRate()).isNull();
        assertThat(side.thirdDownRate()).isNull();
        assertThat(side.redZoneTdRate()).isNull();
        assertThat(side.giveawayRate()).isNull();
        assertThat(side.sackRate()).isNull();
    }
}
