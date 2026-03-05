package com.rzs.stats.service;

import com.rzs.stats.client.NeonSportzClient;
import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.model.ns.NsGame;
import com.rzs.stats.model.ns.NsLeague;
import com.rzs.stats.model.ns.NsTeam;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.repository.TeamRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Service
public class SyncService {

    private final NeonSportzClient client;
    private final TeamRepository teamRepository;
    private final GameRepository gameRepository;

    private Instant lastSyncTime;
    private String lastSyncMessage;
    private boolean lastSyncSuccess;

    public SyncService(NeonSportzClient client, TeamRepository teamRepository, GameRepository gameRepository) {
        this.client = client;
        this.teamRepository = teamRepository;
        this.gameRepository = gameRepository;
    }

    @Transactional
    public SyncResult sync() {
        int teamsUpserted = 0;
        int gamesAdded = 0;

        try {
            NsLeague league = client.fetchLeagueInfo();
            // season from API is 1-based; seasonIndex = season - 1
            int currentSeasonIndex = league.getSeason() - 1;

            // Sync teams
            List<NsTeam> nsTeams = client.fetchAllTeams();
            for (NsTeam nsTeam : nsTeams) {
                upsertTeam(nsTeam);
                teamsUpserted++;
            }

            // Sync all seasons so historical trends are fully populated.
            // Seasons with no data in NeonSportz return quickly (0 games).
            for (int s = 0; s <= currentSeasonIndex; s++) {
                gamesAdded += syncGamesForSeason(s);
            }

            String message = teamsUpserted + " teams synced, " + gamesAdded + " games added/updated";
            lastSyncTime = Instant.now();
            lastSyncMessage = message;
            lastSyncSuccess = true;
            return new SyncResult(true, message);

        } catch (Exception e) {
            String message = "Sync failed: " + e.getMessage();
            lastSyncTime = Instant.now();
            lastSyncMessage = message;
            lastSyncSuccess = false;
            return new SyncResult(false, message);
        }
    }

    private int syncGamesForSeason(int seasonIndex) {
        int count = 0;
        // stageIndex=1 contains both regular season (weekIndex 0-17) and playoffs (weekIndex >= 18)
        List<NsGame> games = client.fetchAllGamesForSeason(seasonIndex);
        for (NsGame nsGame : games) {
            if (nsGame.getStatus() != null && nsGame.getStatus() >= 2) {
                if (upsertGame(nsGame)) count++;
            }
        }
        return count;
    }

    private void upsertTeam(NsTeam ns) {
        TeamEntity team = teamRepository.findByTeamId(ns.getTeamId())
                .orElse(new TeamEntity());
        team.setTeamId(ns.getTeamId());
        team.setDisplayName(ns.getDisplayName());
        team.setNickname(ns.getNickName());
        team.setCityName(ns.getCityName());
        team.setAbbrName(ns.getAbbrName());
        team.setConference(ns.getConferenceName());
        team.setDivision(ns.getDivisionName());
        team.setPrimaryColor(ns.getPrimaryColor());
        team.setLogoId(ns.getLogoId());
        teamRepository.save(team);
    }

    private boolean upsertGame(NsGame ns) {
        Optional<GameEntity> existing = gameRepository.findByGameId(ns.getGameId());
        GameEntity game = existing.orElse(new GameEntity());
        game.setGameId(ns.getGameId());
        game.setSeasonIndex(ns.getSeasonIndex());
        game.setStageIndex(ns.getStageIndex());
        game.setWeekIndex(ns.getWeekIndex());
        game.setHomeScore(ns.getHomeScore());
        game.setAwayScore(ns.getAwayScore());
        game.setStatus(ns.getStatus());
        game.setSimmed(ns.getSimmed());

        if (ns.getHomeTeam() != null) {
            teamRepository.findByTeamId(ns.getHomeTeam().getTeamId()).ifPresent(game::setHomeTeam);
        }
        if (ns.getAwayTeam() != null) {
            teamRepository.findByTeamId(ns.getAwayTeam().getTeamId()).ifPresent(game::setAwayTeam);
        }

        gameRepository.save(game);
        return existing.isEmpty();
    }

    public SyncStatus getStatus() {
        return new SyncStatus(lastSyncTime, lastSyncMessage, lastSyncSuccess);
    }

    public record SyncResult(boolean success, String message) {}

    public record SyncStatus(Instant lastSyncTime, String message, Boolean success) {}
}
