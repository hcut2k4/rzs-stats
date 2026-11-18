package com.rzs.stats.model.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "team_game_stats", uniqueConstraints = @UniqueConstraint(columnNames = {"seasonIndex", "stageIndex", "weekIndex", "team_id"}),
        indexes = @Index(columnList = "seasonIndex, stageIndex, weekIndex"))
public class TeamGameStatEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private int seasonIndex;
    private int stageIndex;
    private int weekIndex;
    @ManyToOne(fetch = FetchType.EAGER)
    private TeamEntity team;
    private int passAtt;
    private int rushAtt;
    private int sacks;
    private int totalYds;
    private int firstDowns;
    private int thirdAtt;
    private int thirdConv;
    private int fourthAtt;
    private int fourthConv;
    private int redZones;
    private int redZoneTds;
    private int passTds;
    private int rushTds;
    private int intsLost;
    private int fumLost;
    private int punts;
    private int fgAtt;
    private int fgMade;
    private int xpAtt;
    private int xpMade;
    private int twoPtAtt;
    private int twoPtConv;

    public Long getId() { return id; }
    public int getSeasonIndex() { return seasonIndex; }
    public void setSeasonIndex(int seasonIndex) { this.seasonIndex = seasonIndex; }
    public int getStageIndex() { return stageIndex; }
    public void setStageIndex(int stageIndex) { this.stageIndex = stageIndex; }
    public int getWeekIndex() { return weekIndex; }
    public void setWeekIndex(int weekIndex) { this.weekIndex = weekIndex; }
    public TeamEntity getTeam() { return team; }
    public void setTeam(TeamEntity team) { this.team = team; }
    public int getPassAtt() { return passAtt; }
    public void setPassAtt(int passAtt) { this.passAtt = passAtt; }
    public int getRushAtt() { return rushAtt; }
    public void setRushAtt(int rushAtt) { this.rushAtt = rushAtt; }
    public int getSacks() { return sacks; }
    public void setSacks(int sacks) { this.sacks = sacks; }
    public int getTotalYds() { return totalYds; }
    public void setTotalYds(int totalYds) { this.totalYds = totalYds; }
    public int getFirstDowns() { return firstDowns; }
    public void setFirstDowns(int firstDowns) { this.firstDowns = firstDowns; }
    public int getThirdAtt() { return thirdAtt; }
    public void setThirdAtt(int thirdAtt) { this.thirdAtt = thirdAtt; }
    public int getThirdConv() { return thirdConv; }
    public void setThirdConv(int thirdConv) { this.thirdConv = thirdConv; }
    public int getFourthAtt() { return fourthAtt; }
    public void setFourthAtt(int fourthAtt) { this.fourthAtt = fourthAtt; }
    public int getFourthConv() { return fourthConv; }
    public void setFourthConv(int fourthConv) { this.fourthConv = fourthConv; }
    public int getRedZones() { return redZones; }
    public void setRedZones(int redZones) { this.redZones = redZones; }
    public int getRedZoneTds() { return redZoneTds; }
    public void setRedZoneTds(int redZoneTds) { this.redZoneTds = redZoneTds; }
    public int getPassTds() { return passTds; }
    public void setPassTds(int passTds) { this.passTds = passTds; }
    public int getRushTds() { return rushTds; }
    public void setRushTds(int rushTds) { this.rushTds = rushTds; }
    public int getIntsLost() { return intsLost; }
    public void setIntsLost(int intsLost) { this.intsLost = intsLost; }
    public int getFumLost() { return fumLost; }
    public void setFumLost(int fumLost) { this.fumLost = fumLost; }
    public int getPunts() { return punts; }
    public void setPunts(int punts) { this.punts = punts; }
    public int getFgAtt() { return fgAtt; }
    public void setFgAtt(int fgAtt) { this.fgAtt = fgAtt; }
    public int getFgMade() { return fgMade; }
    public void setFgMade(int fgMade) { this.fgMade = fgMade; }
    public int getXpAtt() { return xpAtt; }
    public void setXpAtt(int xpAtt) { this.xpAtt = xpAtt; }
    public int getXpMade() { return xpMade; }
    public void setXpMade(int xpMade) { this.xpMade = xpMade; }
    public int getTwoPtAtt() { return twoPtAtt; }
    public void setTwoPtAtt(int twoPtAtt) { this.twoPtAtt = twoPtAtt; }
    public int getTwoPtConv() { return twoPtConv; }
    public void setTwoPtConv(int twoPtConv) { this.twoPtConv = twoPtConv; }
}
