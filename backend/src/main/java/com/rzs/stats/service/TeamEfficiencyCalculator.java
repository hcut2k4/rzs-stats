package com.rzs.stats.service;

import com.rzs.stats.model.dto.TeamEfficiencyDto.Side;
import com.rzs.stats.model.entity.TeamGameStatEntity;
import org.springframework.stereotype.Component;

@Component
public class TeamEfficiencyCalculator {
    public static class Totals {
        int drives, plays, yards, firstDowns, touchdowns, thirdAtt, thirdConv, redZones, redZoneTds, giveaways, sacks, passAtt;
        double points;
    }

    public int touchdowns(TeamGameStatEntity r) { return r.getPassTds() + r.getRushTds(); }

    public int plays(TeamGameStatEntity r) { return r.getPassAtt() + r.getRushAtt() + r.getSacks(); }

    // Drives are never reported, so each one is counted by how it ended; end-of-half kneel-downs and
    // clock-outs are the only possessions this cannot see.
    public int drives(TeamGameStatEntity r) {
        return touchdowns(r) + r.getFgAtt() + r.getPunts() + r.getIntsLost() + r.getFumLost()
                + Math.max(0, r.getFourthAtt() - r.getFourthConv());
    }

    // Every touchdown earns one PAT try, so tries beyond our own touchdowns followed defensive or return
    // scores. Scale the PAT points down to the share that came after offensive touchdowns.
    public double offensivePoints(TeamGameStatEntity r) {
        int tries = r.getXpAtt() + r.getTwoPtAtt();
        double pat = tries == 0 ? 0.0
                : (r.getXpMade() + 2.0 * r.getTwoPtConv()) * Math.min(1.0, (double) touchdowns(r) / tries);
        return 6.0 * touchdowns(r) + 3.0 * r.getFgMade() + pat;
    }

    public void add(Totals t, TeamGameStatEntity r) {
        t.drives += drives(r);
        t.plays += plays(r);
        t.points += offensivePoints(r);
        t.yards += r.getTotalYds();
        t.firstDowns += r.getFirstDowns();
        t.touchdowns += touchdowns(r);
        t.thirdAtt += r.getThirdAtt();
        t.thirdConv += r.getThirdConv();
        t.redZones += r.getRedZones();
        t.redZoneTds += r.getRedZoneTds();
        t.giveaways += r.getIntsLost() + r.getFumLost();
        t.sacks += r.getSacks();
        t.passAtt += r.getPassAtt();
    }

    public Side side(Totals t) {
        return new Side(t.drives, t.plays, divide(t.points, t.drives), divide(t.points, t.plays),
                divide(t.yards, t.plays), divide(t.firstDowns + t.touchdowns, t.firstDowns + t.drives),
                divide(t.thirdConv, t.thirdAtt), divide(t.redZoneTds, t.redZones), divide(t.giveaways, t.drives),
                divide(t.sacks, t.passAtt + t.sacks));
    }

    static Double divide(double numerator, double denominator) {
        return denominator == 0 ? null : numerator / denominator;
    }
}
