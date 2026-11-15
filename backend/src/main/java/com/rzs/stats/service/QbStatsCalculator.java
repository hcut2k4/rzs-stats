package com.rzs.stats.service;

import com.rzs.stats.model.dto.QbStatDto;
import com.rzs.stats.model.entity.QbGameStatEntity;
import org.springframework.stereotype.Component;
import java.util.List;

@Component
public class QbStatsCalculator {
    public double sackYardsLost(QbGameStatEntity row) {
        return row.getTeamSacks() == 0 ? 0.0 : Math.max(0.0, (double) row.getTeamPasserYards() - row.getTeamNetPassYds())
                * row.getPassSacks() / row.getTeamSacks();
    }

    public double fumblesLost(QbGameStatEntity row) {
        return row.getTeamFumbles() == 0 ? 0.0 : row.getRushFum()
                * Math.min(1.0, (double) row.getTeamFumblesLost() / row.getTeamFumbles());
    }

    public QbStatDto calculate(List<QbGameStatEntity> rows) {
        QbStatDto d = new QbStatDto();
        d.sackYardsLost = 0.0;
        d.fumblesLost = 0.0;
        for (QbGameStatEntity r : rows) {
            d.rosterId = r.getRosterId();
            d.playerName = r.getPlayerName();
            d.teamAbbr = r.getTeam().getAbbrName();
            d.teamName = r.getTeam().getDisplayName();
            d.passAtt += r.getPassAtt();
            d.passComp += r.getPassComp();
            d.passYds += r.getPassYds();
            d.passTd += r.getPassTd();
            d.passInt += r.getPassInt();
            d.passSacks += r.getPassSacks();
            d.rushAtt += r.getRushAtt();
            d.rushYds += r.getRushYds();
            d.rushTd += r.getRushTd();
            d.sackYardsLost += sackYardsLost(r);
            d.fumblesLost += fumblesLost(r);
        }
        d.gamesPlayed = rows.size();
        double passPlays = (double) d.passAtt + d.passSacks;
        double passNumerator = d.passYds - d.sackYardsLost + 20.0 * d.passTd - 45.0 * (d.passInt + d.fumblesLost);
        d.tanya = divide(passNumerator + d.rushYds + 20.0 * d.rushTd, passPlays + d.rushAtt);
        // Every estimated lost fumble is charged here by convention: Madden cannot separate rushing
        // fumbles from strip-sacks, and ANY/A carries no fumble term at all.
        d.rushValue = divide(d.rushYds - 4.0 * d.rushAtt + 20.0 * d.rushTd - 45.0 * d.fumblesLost, passPlays);
        d.anya = divide(d.passYds - d.sackYardsLost + 20.0 * d.passTd - 45.0 * d.passInt, passPlays);
        d.tdPct = divide(d.passTd, d.passAtt);
        d.intPct = divide(d.passInt, d.passAtt);
        d.tdToInt = divide(d.passTd, d.passInt);
        d.rushYdsPerAtt = divide(d.rushYds, d.rushAtt);
        if (d.passAtt > 0) {
            double a = clamp(((double) d.passComp / d.passAtt - 0.3) * 5);
            double b = clamp(((double) d.passYds / d.passAtt - 3) * 0.25);
            double c = clamp((double) d.passTd / d.passAtt * 20);
            double e = clamp(2.375 - (double) d.passInt / d.passAtt * 25);
            d.passerRating = (a + b + c + e) / 6 * 100;
        }
        return d;
    }

    private double clamp(double value) { return Math.max(0, Math.min(2.375, value)); }
    private Double divide(double numerator, double denominator) { return denominator == 0 ? null : numerator / denominator; }
}
