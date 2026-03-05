package com.rzs.stats.model.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "game",
    indexes = {
        @Index(name = "idx_game_season_stage_week", columnList = "seasonIndex, stageIndex, weekIndex"),
        @Index(name = "idx_game_home_team", columnList = "home_team_id"),
        @Index(name = "idx_game_away_team", columnList = "away_team_id")
    },
    uniqueConstraints = @UniqueConstraint(name = "uq_game_season_gameid", columnNames = {"seasonIndex", "gameId"})
)
public class GameEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Integer gameId;

    private Integer seasonIndex;
    private Integer stageIndex;
    private Integer weekIndex;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "home_team_id")
    private TeamEntity homeTeam;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "away_team_id")
    private TeamEntity awayTeam;

    private Integer homeScore;
    private Integer awayScore;
    private Integer status;
    private Boolean simmed;

    public Long getId() { return id; }
    public Integer getGameId() { return gameId; }
    public void setGameId(Integer gameId) { this.gameId = gameId; }
    public Integer getSeasonIndex() { return seasonIndex; }
    public void setSeasonIndex(Integer seasonIndex) { this.seasonIndex = seasonIndex; }
    public Integer getStageIndex() { return stageIndex; }
    public void setStageIndex(Integer stageIndex) { this.stageIndex = stageIndex; }
    public Integer getWeekIndex() { return weekIndex; }
    public void setWeekIndex(Integer weekIndex) { this.weekIndex = weekIndex; }
    public TeamEntity getHomeTeam() { return homeTeam; }
    public void setHomeTeam(TeamEntity homeTeam) { this.homeTeam = homeTeam; }
    public TeamEntity getAwayTeam() { return awayTeam; }
    public void setAwayTeam(TeamEntity awayTeam) { this.awayTeam = awayTeam; }
    public Integer getHomeScore() { return homeScore; }
    public void setHomeScore(Integer homeScore) { this.homeScore = homeScore; }
    public Integer getAwayScore() { return awayScore; }
    public void setAwayScore(Integer awayScore) { this.awayScore = awayScore; }
    public Integer getStatus() { return status; }
    public void setStatus(Integer status) { this.status = status; }
    public Boolean getSimmed() { return simmed; }
    public void setSimmed(Boolean simmed) { this.simmed = simmed; }
}
