package com.rzs.stats.model.dto;

public class GameDto {
    private Integer gameId;
    private Integer nsPk;
    private Integer seasonIndex;
    private Integer stageIndex;
    private Integer weekIndex;
    private TeamDto homeTeam;
    private TeamDto awayTeam;
    private Integer homeScore;
    private Integer awayScore;
    private Integer status;
    private Boolean simmed;

    public Integer getGameId() { return gameId; }
    public void setGameId(Integer gameId) { this.gameId = gameId; }
    public Integer getNsPk() { return nsPk; }
    public void setNsPk(Integer nsPk) { this.nsPk = nsPk; }
    public Integer getSeasonIndex() { return seasonIndex; }
    public void setSeasonIndex(Integer seasonIndex) { this.seasonIndex = seasonIndex; }
    public Integer getStageIndex() { return stageIndex; }
    public void setStageIndex(Integer stageIndex) { this.stageIndex = stageIndex; }
    public Integer getWeekIndex() { return weekIndex; }
    public void setWeekIndex(Integer weekIndex) { this.weekIndex = weekIndex; }
    public TeamDto getHomeTeam() { return homeTeam; }
    public void setHomeTeam(TeamDto homeTeam) { this.homeTeam = homeTeam; }
    public TeamDto getAwayTeam() { return awayTeam; }
    public void setAwayTeam(TeamDto awayTeam) { this.awayTeam = awayTeam; }
    public Integer getHomeScore() { return homeScore; }
    public void setHomeScore(Integer homeScore) { this.homeScore = homeScore; }
    public Integer getAwayScore() { return awayScore; }
    public void setAwayScore(Integer awayScore) { this.awayScore = awayScore; }
    public Integer getStatus() { return status; }
    public void setStatus(Integer status) { this.status = status; }
    public Boolean getSimmed() { return simmed; }
    public void setSimmed(Boolean simmed) { this.simmed = simmed; }
}
