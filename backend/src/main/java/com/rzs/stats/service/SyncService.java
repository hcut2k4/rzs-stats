package com.rzs.stats.service;

import com.rzs.stats.client.NeonSportzClient;
import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.model.ns.NsGame;
import com.rzs.stats.model.ns.NsLeague;
import com.rzs.stats.model.ns.NsTeam;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.repository.TeamRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.TreeMap;

@Service
public class SyncService {

    private static final Logger log = LoggerFactory.getLogger(SyncService.class);

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
            log.info("Sync started");
            NsLeague league = client.fetchLeagueInfo();
            // season from API is 1-based and matches the seasonIndex used in game requests
            int currentSeasonIndex = league.getSeason();
            log.info("Current season index: {}", currentSeasonIndex);

            // Sync teams
            List<NsTeam> nsTeams = client.fetchAllTeams();
            for (NsTeam nsTeam : nsTeams) {
                upsertTeam(nsTeam);
                teamsUpserted++;
            }
            log.info("Teams synced: {}", teamsUpserted);

            // Sync all seasons so historical trends are fully populated.
            // Seasons with no data in NeonSportz return quickly (0 games).
            for (int s = 0; s <= currentSeasonIndex; s++) {
                log.info("Syncing season {}/{}", s, currentSeasonIndex);
                gamesAdded += syncGamesForSeason(s);
            }

            String message = teamsUpserted + " teams synced, " + gamesAdded + " games added/updated";
            lastSyncTime = Instant.now();
            lastSyncMessage = message;
            lastSyncSuccess = true;
            log.info("Sync completed: {}", message);
            return new SyncResult(true, message);

        } catch (Exception e) {
            String message = "Sync failed: " + e.getMessage();
            lastSyncTime = Instant.now();
            lastSyncMessage = message;
            lastSyncSuccess = false;
            log.error("Sync failed after {} teams, {} games", teamsUpserted, gamesAdded, e);
            return new SyncResult(false, message);
        }
    }

    @Transactional
    public VerboseSyncResult syncVerbose() {
        List<String> log = new ArrayList<>();
        int teamsUpserted = 0;
        int gamesAdded = 0;

        try {
            NsLeague league = client.fetchLeagueInfo();
            int currentSeasonIndex = league.getSeason();
            log.add("[LEAGUE] season=" + league.getSeason() + ", week=" + league.getWeek() + ", calendarYear=" + league.getCalendarYear());

            List<NsTeam> nsTeams = client.fetchAllTeams();
            log.add("[TEAMS] API returned " + nsTeams.size() + " teams");
            for (NsTeam nsTeam : nsTeams) {
                upsertTeam(nsTeam);
                log.add("[TEAMS] Upserted: " + nsTeam.getDisplayName() + " (teamId=" + nsTeam.getTeamId() + ", nsId=" + nsTeam.getId() + ")");
                teamsUpserted++;
            }

            for (int s = 0; s <= currentSeasonIndex; s++) {
                int[] result = syncGamesForSeasonVerbose(s, log);
                gamesAdded += result[0];
            }

            String message = teamsUpserted + " teams synced, " + gamesAdded + " games added/updated";
            lastSyncTime = Instant.now();
            lastSyncMessage = message;
            lastSyncSuccess = true;
            log.add("[DONE] " + message);
            return new VerboseSyncResult(true, message, log);

        } catch (Exception e) {
            String message = "Sync failed: " + e.getMessage();
            lastSyncTime = Instant.now();
            lastSyncMessage = message;
            lastSyncSuccess = false;
            log.add("[ERROR] " + message);
            return new VerboseSyncResult(false, message, log);
        }
    }

    private int[] syncGamesForSeasonVerbose(int seasonIndex, List<String> log) {
        List<NsGame> games = client.fetchAllGamesForSeason(seasonIndex);
        if (games.isEmpty()) {
            log.add("[SEASON " + seasonIndex + "] API returned 0 games — skipping");
            return new int[]{0};
        }
        log.add("[SEASON " + seasonIndex + "] API returned " + games.size() + " games");

        int stored = 0, skippedStatus = 0;
        TreeMap<Integer, int[]> weekStats = new TreeMap<>();

        for (NsGame nsGame : games) {
            if (nsGame.getStatus() == null) {
                skippedStatus++;
                continue;
            }
            int week = nsGame.getWeekIndex() != null ? nsGame.getWeekIndex() : -1;
            weekStats.putIfAbsent(week, new int[]{0, 0});
            if (upsertGameVerbose(nsGame, log, weekStats, week)) stored++;
        }

        if (skippedStatus > 0) log.add("[SEASON " + seasonIndex + "] Skipped " + skippedStatus + " — null status");

        int totalNullTeam = weekStats.values().stream().mapToInt(a -> a[1]).sum();
        log.add("[SEASON " + seasonIndex + "] Stored " + (games.size() - skippedStatus) +
                " — team resolved: " + ((games.size() - skippedStatus) - totalNullTeam) +
                ", null team: " + totalNullTeam);

        for (var entry : weekStats.entrySet()) {
            int wk = entry.getKey();
            int wkNull = entry.getValue()[1];
            if (wkNull > 0) {
                log.add("[SEASON " + seasonIndex + "] Week " + wk + ": " + entry.getValue()[0] + " stored, " + wkNull + " null team");
            }
        }
        return new int[]{stored};
    }

    private boolean upsertGameVerbose(NsGame ns, List<String> log, TreeMap<Integer, int[]> weekStats, int week) {
        Optional<GameEntity> existing = gameRepository.findBySeasonIndexAndGameId(ns.getSeasonIndex(), ns.getGameId());
        GameEntity game = existing.orElse(new GameEntity());
        game.setGameId(ns.getGameId());
        game.setSeasonIndex(ns.getSeasonIndex());
        game.setStageIndex(ns.getStageIndex());
        game.setWeekIndex(ns.getWeekIndex());
        game.setHomeScore(ns.getHomeScore());
        game.setAwayScore(ns.getAwayScore());
        game.setStatus(ns.getStatus());
        game.setSimmed(ns.getSimmed());

        boolean homeResolved = false, awayResolved = false;
        if (ns.getHomeTeam() != null) {
            Optional<TeamEntity> found = resolveTeam(ns.getHomeTeam());
            if (found.isPresent()) { game.setHomeTeam(found.get()); homeResolved = true; }
            else log.add("[SEASON " + ns.getSeasonIndex() + "] Week " + week + " gameId=" + ns.getGameId() +
                         " homeTeam NOT resolved (id=" + ns.getHomeTeam().getId() + ", teamId=" + ns.getHomeTeam().getTeamId() + ")");
        }
        if (ns.getAwayTeam() != null) {
            Optional<TeamEntity> found = resolveTeam(ns.getAwayTeam());
            if (found.isPresent()) { game.setAwayTeam(found.get()); awayResolved = true; }
            else log.add("[SEASON " + ns.getSeasonIndex() + "] Week " + week + " gameId=" + ns.getGameId() +
                         " awayTeam NOT resolved (id=" + ns.getAwayTeam().getId() + ", teamId=" + ns.getAwayTeam().getTeamId() + ")");
        }

        if (!homeResolved || !awayResolved) weekStats.get(week)[1]++;
        weekStats.get(week)[0]++;
        gameRepository.save(game);
        return existing.isEmpty();
    }

    private int syncGamesForSeason(int seasonIndex) {
        int count = 0;
        // stageIndex=1 contains both regular season (weekIndex 0-17) and playoffs (weekIndex >= 18)
        List<NsGame> games = client.fetchAllGamesForSeason(seasonIndex);
        for (NsGame nsGame : games) {
            if (nsGame.getStatus() != null) {
                if (upsertGame(nsGame)) count++;
            }
        }
        return count;
    }

    private java.util.Optional<TeamEntity> resolveTeam(NsTeam ns) {
        if (ns.getTeamId() != null) {
            java.util.Optional<TeamEntity> found = teamRepository.findByTeamId(ns.getTeamId());
            if (found.isPresent()) return found;
        }
        if (ns.getId() != null) {
            return teamRepository.findByNsId(ns.getId());
        }
        return java.util.Optional.empty();
    }

    private void upsertTeam(NsTeam ns) {
        TeamEntity team = teamRepository.findByTeamId(ns.getTeamId())
                .orElse(new TeamEntity());
        team.setTeamId(ns.getTeamId());
        team.setNsId(ns.getId());
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
        Optional<GameEntity> existing = gameRepository.findBySeasonIndexAndGameId(ns.getSeasonIndex(), ns.getGameId());
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
            resolveTeam(ns.getHomeTeam()).ifPresent(game::setHomeTeam);
        }
        if (ns.getAwayTeam() != null) {
            resolveTeam(ns.getAwayTeam()).ifPresent(game::setAwayTeam);
        }

        gameRepository.save(game);
        return existing.isEmpty();
    }

    public SyncStatus getStatus() {
        return new SyncStatus(lastSyncTime, lastSyncMessage, lastSyncSuccess);
    }

    public record SyncResult(boolean success, String message) {}

    public record VerboseSyncResult(boolean success, String message, java.util.List<String> log) {}

    public record SyncStatus(Instant lastSyncTime, String message, Boolean success) {}
}
