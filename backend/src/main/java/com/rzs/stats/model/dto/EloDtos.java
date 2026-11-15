package com.rzs.stats.model.dto;

import com.rzs.stats.service.EloService.Team;

public class EloDtos {
    public record Rating(int teamId, String abbrName, String displayName, double elo, int rank,
                         double change, int prevRank, int rankChange, int gamesCounted) {}
    public record History(int teamId, int season, int week, boolean seasonStart, double startElo,
                          double endElo, double change, int rank) {}
    public record Game(Integer gameId, int season, int week, Team homeTeam, Team awayTeam,
                       double homePregameElo, double awayPregameElo, double homeWinProbability,
                       double awayWinProbability, int homeScore, int awayScore, long margin,
                       double movMultiplier, double pointsMoved, double homePostgameElo, double awayPostgameElo) {}
    public record Matchup(Team teamA, Team teamB, double eloA, double eloB,
                          double teamAWinProbability, double teamBWinProbability) {}
}
