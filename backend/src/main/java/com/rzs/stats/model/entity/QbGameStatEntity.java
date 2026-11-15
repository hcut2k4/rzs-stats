package com.rzs.stats.model.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "qb_game_stats", uniqueConstraints = @UniqueConstraint(columnNames = {"seasonIndex", "stageIndex", "weekIndex", "rosterId"}),
        indexes = {@Index(columnList = "seasonIndex, stageIndex, weekIndex"), @Index(columnList = "rosterId")})
public class QbGameStatEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private int seasonIndex;
    private int stageIndex;
    private int weekIndex;
    private int passAtt;
    private int passComp;
    private int passYds;
    private int passTd;
    private int passInt;
    private int passSacks;
    private int rushAtt;
    private int rushYds;
    private int rushTd;
    private int rushFum;
    private int teamPasserYards;
    private int teamNetPassYds;
    private int teamSacks;
    private int teamFumbles;
    private int teamFumblesLost;
    private String rosterId;
    private String playerName;
    private Double passerRating;
    @ManyToOne(fetch = FetchType.EAGER)
    private TeamEntity team;

    public Long getId() { return id; }
    public int getSeasonIndex() { return seasonIndex; }
    public void setSeasonIndex(int seasonIndex) { this.seasonIndex = seasonIndex; }
    public int getStageIndex() { return stageIndex; }
    public void setStageIndex(int stageIndex) { this.stageIndex = stageIndex; }
    public int getWeekIndex() { return weekIndex; }
    public void setWeekIndex(int weekIndex) { this.weekIndex = weekIndex; }
    public int getPassAtt() { return passAtt; }
    public void setPassAtt(int passAtt) { this.passAtt = passAtt; }
    public int getPassComp() { return passComp; }
    public void setPassComp(int passComp) { this.passComp = passComp; }
    public int getPassYds() { return passYds; }
    public void setPassYds(int passYds) { this.passYds = passYds; }
    public int getPassTd() { return passTd; }
    public void setPassTd(int passTd) { this.passTd = passTd; }
    public int getPassInt() { return passInt; }
    public void setPassInt(int passInt) { this.passInt = passInt; }
    public int getPassSacks() { return passSacks; }
    public void setPassSacks(int passSacks) { this.passSacks = passSacks; }
    public int getRushAtt() { return rushAtt; }
    public void setRushAtt(int rushAtt) { this.rushAtt = rushAtt; }
    public int getRushYds() { return rushYds; }
    public void setRushYds(int rushYds) { this.rushYds = rushYds; }
    public int getRushTd() { return rushTd; }
    public void setRushTd(int rushTd) { this.rushTd = rushTd; }
    public int getRushFum() { return rushFum; }
    public void setRushFum(int rushFum) { this.rushFum = rushFum; }
    public int getTeamPasserYards() { return teamPasserYards; }
    public void setTeamPasserYards(int teamPasserYards) { this.teamPasserYards = teamPasserYards; }
    public int getTeamNetPassYds() { return teamNetPassYds; }
    public void setTeamNetPassYds(int teamNetPassYds) { this.teamNetPassYds = teamNetPassYds; }
    public int getTeamSacks() { return teamSacks; }
    public void setTeamSacks(int teamSacks) { this.teamSacks = teamSacks; }
    public int getTeamFumbles() { return teamFumbles; }
    public void setTeamFumbles(int teamFumbles) { this.teamFumbles = teamFumbles; }
    public int getTeamFumblesLost() { return teamFumblesLost; }
    public void setTeamFumblesLost(int teamFumblesLost) { this.teamFumblesLost = teamFumblesLost; }
    public String getRosterId() { return rosterId; }
    public void setRosterId(String rosterId) { this.rosterId = rosterId; }
    public String getPlayerName() { return playerName; }
    public void setPlayerName(String playerName) { this.playerName = playerName; }
    public Double getPasserRating() { return passerRating; }
    public void setPasserRating(Double passerRating) { this.passerRating = passerRating; }
    public TeamEntity getTeam() { return team; }
    public void setTeam(TeamEntity team) { this.team = team; }
}
