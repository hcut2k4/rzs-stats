package com.rzs.stats.model.ns;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class NsGame {
    private Integer pk;
    private Integer gameId;
    private Integer seasonIndex;
    private Integer stageIndex;
    private Integer weekIndex;
    private NsTeam homeTeam;
    private NsTeam awayTeam;
    private Integer homeScore;
    private Integer awayScore;
    private Integer status;
    private Boolean simmed;

    public Integer getPk() { return pk; }
    public void setPk(Integer pk) { this.pk = pk; }
    public Integer getGameId() { return gameId; }
    public void setGameId(Integer gameId) { this.gameId = gameId; }
    public Integer getSeasonIndex() { return seasonIndex; }
    public void setSeasonIndex(Integer seasonIndex) { this.seasonIndex = seasonIndex; }
    public Integer getStageIndex() { return stageIndex; }
    public void setStageIndex(Integer stageIndex) { this.stageIndex = stageIndex; }
    public Integer getWeekIndex() { return weekIndex; }
    public void setWeekIndex(Integer weekIndex) { this.weekIndex = weekIndex; }
    public NsTeam getHomeTeam() { return homeTeam; }
    public void setHomeTeam(NsTeam homeTeam) { this.homeTeam = homeTeam; }
    public NsTeam getAwayTeam() { return awayTeam; }
    public void setAwayTeam(NsTeam awayTeam) { this.awayTeam = awayTeam; }
    public Integer getHomeScore() { return homeScore; }
    public void setHomeScore(Integer homeScore) { this.homeScore = homeScore; }
    public Integer getAwayScore() { return awayScore; }
    public void setAwayScore(Integer awayScore) { this.awayScore = awayScore; }
    public Integer getStatus() { return status; }
    public void setStatus(Integer status) { this.status = status; }
    public Boolean getSimmed() { return simmed; }
    public void setSimmed(Boolean simmed) { this.simmed = simmed; }
}
