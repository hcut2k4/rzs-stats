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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.stream.Collectors;

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

            // Batch-load all teams for O(1) lookup during game sync
            Map<Integer, TeamEntity> teamsByTeamId = new HashMap<>();
            Map<Integer, TeamEntity> teamsByNsId = new HashMap<>();
            teamRepository.findAll().forEach(t -> {
                if (t.getTeamId() != null) teamsByTeamId.put(t.getTeamId(), t);
                if (t.getNsId() != null) teamsByNsId.put(t.getNsId(), t);
            });

            // Sync seasons: skip historical seasons already fully stored in DB
            for (int s = 0; s <= currentSeasonIndex; s++) {
                if (s < currentSeasonIndex && gameRepository.countBySeasonIndex(s) > 0) {
                    log.info("Skipping season {}/{} (already synced)", s, currentSeasonIndex);
                    continue;
                }
                log.info("Syncing season {}/{}", s, currentSeasonIndex);
                gamesAdded += syncGamesForSeason(s, teamsByTeamId, teamsByNsId);
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

            Map<Integer, TeamEntity> teamsByTeamId = new HashMap<>();
            Map<Integer, TeamEntity> teamsByNsId = new HashMap<>();
            teamRepository.findAll().forEach(t -> {
                if (t.getTeamId() != null) teamsByTeamId.put(t.getTeamId(), t);
                if (t.getNsId() != null) teamsByNsId.put(t.getNsId(), t);
            });

            for (int s = 0; s <= currentSeasonIndex; s++) {
                if (s < currentSeasonIndex && gameRepository.countBySeasonIndex(s) > 0) {
                    log.add("[SEASON " + s + "] Skipping (already synced)");
                    continue;
                }
                int[] result = syncGamesForSeasonVerbose(s, log, teamsByTeamId, teamsByNsId);
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

    private int[] syncGamesForSeasonVerbose(int seasonIndex, List<String> log,
                                             Map<Integer, TeamEntity> teamsByTeamId,
                                             Map<Integer, TeamEntity> teamsByNsId) {
        List<NsGame> games = client.fetchAllGamesForSeason(seasonIndex);
        if (games.isEmpty()) {
            log.add("[SEASON " + seasonIndex + "] API returned 0 games — skipping");
            return new int[]{0};
        }
        log.add("[SEASON " + seasonIndex + "] API returned " + games.size() + " games");

        Map<Integer, GameEntity> existingByGameId = gameRepository.findBySeasonIndex(seasonIndex)
                .stream().collect(Collectors.toMap(GameEntity::getGameId, g -> g));

        int stored = 0, skippedStatus = 0;
        TreeMap<Integer, int[]> weekStats = new TreeMap<>();

        for (NsGame nsGame : games) {
            if (nsGame.getStatus() == null) {
                skippedStatus++;
                continue;
            }
            int week = nsGame.getWeekIndex() != null ? nsGame.getWeekIndex() : -1;
            weekStats.putIfAbsent(week, new int[]{0, 0});
            if (upsertGameVerbose(nsGame, log, weekStats, week, existingByGameId, teamsByTeamId, teamsByNsId)) stored++;
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

    private boolean upsertGameVerbose(NsGame ns, List<String> log, TreeMap<Integer, int[]> weekStats, int week,
                                       Map<Integer, GameEntity> existingByGameId,
                                       Map<Integer, TeamEntity> teamsByTeamId,
                                       Map<Integer, TeamEntity> teamsByNsId) {
        GameEntity existing = existingByGameId.get(ns.getGameId());
        boolean isNew = existing == null;
        GameEntity game = isNew ? new GameEntity() : existing;

        TeamEntity resolvedHome = ns.getHomeTeam() != null ? resolveTeam(ns.getHomeTeam(), teamsByTeamId, teamsByNsId) : null;
        TeamEntity resolvedAway = ns.getAwayTeam() != null ? resolveTeam(ns.getAwayTeam(), teamsByTeamId, teamsByNsId) : null;
        boolean homeResolved = resolvedHome != null;
        boolean awayResolved = resolvedAway != null;

        if (!homeResolved && ns.getHomeTeam() != null) {
            log.add("[SEASON " + ns.getSeasonIndex() + "] Week " + week + " gameId=" + ns.getGameId() +
                    " homeTeam NOT resolved (id=" + ns.getHomeTeam().getId() + ", teamId=" + ns.getHomeTeam().getTeamId() + ")");
        }
        if (!awayResolved && ns.getAwayTeam() != null) {
            log.add("[SEASON " + ns.getSeasonIndex() + "] Week " + week + " gameId=" + ns.getGameId() +
                    " awayTeam NOT resolved (id=" + ns.getAwayTeam().getId() + ", teamId=" + ns.getAwayTeam().getTeamId() + ")");
        }

        if (!homeResolved || !awayResolved) weekStats.get(week)[1]++;
        weekStats.get(week)[0]++;

        if (!isNew) {
            boolean teamChanged = !Objects.equals(
                    existing.getHomeTeam() != null ? existing.getHomeTeam().getId() : null,
                    resolvedHome != null ? resolvedHome.getId() : null)
                    || !Objects.equals(
                    existing.getAwayTeam() != null ? existing.getAwayTeam().getId() : null,
                    resolvedAway != null ? resolvedAway.getId() : null);
            boolean changed = !Objects.equals(existing.getStatus(), ns.getStatus())
                    || !Objects.equals(existing.getHomeScore(), ns.getHomeScore())
                    || !Objects.equals(existing.getAwayScore(), ns.getAwayScore())
                    || !Objects.equals(existing.getStageIndex(), ns.getStageIndex())
                    || !Objects.equals(existing.getWeekIndex(), ns.getWeekIndex())
                    || !Objects.equals(existing.getSimmed(), ns.getSimmed())
                    || teamChanged;
            if (!changed) return false;
        }

        game.setGameId(ns.getGameId());
        game.setSeasonIndex(ns.getSeasonIndex());
        game.setStageIndex(ns.getStageIndex());
        game.setWeekIndex(ns.getWeekIndex());
        game.setHomeScore(ns.getHomeScore());
        game.setAwayScore(ns.getAwayScore());
        game.setStatus(ns.getStatus());
        game.setSimmed(ns.getSimmed());
        if (resolvedHome != null) game.setHomeTeam(resolvedHome);
        if (resolvedAway != null) game.setAwayTeam(resolvedAway);

        gameRepository.save(game);
        return isNew;
    }

    private int syncGamesForSeason(int seasonIndex, Map<Integer, TeamEntity> teamsByTeamId,
                                    Map<Integer, TeamEntity> teamsByNsId) {
        List<NsGame> games = client.fetchAllGamesForSeason(seasonIndex);
        if (games.isEmpty()) return 0;

        Map<Integer, GameEntity> existingByGameId = gameRepository.findBySeasonIndex(seasonIndex)
                .stream().collect(Collectors.toMap(GameEntity::getGameId, g -> g));

        int count = 0;
        for (NsGame nsGame : games) {
            if (nsGame.getStatus() != null) {
                if (upsertGame(nsGame, existingByGameId, teamsByTeamId, teamsByNsId)) count++;
            }
        }
        return count;
    }

    private TeamEntity resolveTeam(NsTeam ns, Map<Integer, TeamEntity> teamsByTeamId,
                                    Map<Integer, TeamEntity> teamsByNsId) {
        if (ns.getTeamId() != null) {
            TeamEntity found = teamsByTeamId.get(ns.getTeamId());
            if (found != null) return found;
        }
        if (ns.getId() != null) {
            return teamsByNsId.get(ns.getId());
        }
        return null;
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

    private boolean upsertGame(NsGame ns, Map<Integer, GameEntity> existingByGameId,
                                Map<Integer, TeamEntity> teamsByTeamId,
                                Map<Integer, TeamEntity> teamsByNsId) {
        GameEntity existing = existingByGameId.get(ns.getGameId());
        boolean isNew = existing == null;
        GameEntity game = isNew ? new GameEntity() : existing;

        TeamEntity resolvedHome = ns.getHomeTeam() != null ? resolveTeam(ns.getHomeTeam(), teamsByTeamId, teamsByNsId) : null;
        TeamEntity resolvedAway = ns.getAwayTeam() != null ? resolveTeam(ns.getAwayTeam(), teamsByTeamId, teamsByNsId) : null;

        if (!isNew) {
            boolean teamChanged = !Objects.equals(
                    existing.getHomeTeam() != null ? existing.getHomeTeam().getId() : null,
                    resolvedHome != null ? resolvedHome.getId() : null)
                    || !Objects.equals(
                    existing.getAwayTeam() != null ? existing.getAwayTeam().getId() : null,
                    resolvedAway != null ? resolvedAway.getId() : null);
            boolean changed = !Objects.equals(existing.getStatus(), ns.getStatus())
                    || !Objects.equals(existing.getHomeScore(), ns.getHomeScore())
                    || !Objects.equals(existing.getAwayScore(), ns.getAwayScore())
                    || !Objects.equals(existing.getStageIndex(), ns.getStageIndex())
                    || !Objects.equals(existing.getWeekIndex(), ns.getWeekIndex())
                    || !Objects.equals(existing.getSimmed(), ns.getSimmed())
                    || teamChanged;
            if (!changed) return false;
        }

        game.setGameId(ns.getGameId());
        game.setSeasonIndex(ns.getSeasonIndex());
        game.setStageIndex(ns.getStageIndex());
        game.setWeekIndex(ns.getWeekIndex());
        game.setHomeScore(ns.getHomeScore());
        game.setAwayScore(ns.getAwayScore());
        game.setStatus(ns.getStatus());
        game.setSimmed(ns.getSimmed());
        if (resolvedHome != null) game.setHomeTeam(resolvedHome);
        if (resolvedAway != null) game.setAwayTeam(resolvedAway);

        gameRepository.save(game);
        return isNew;
    }

    public SyncStatus getStatus() {
        return new SyncStatus(lastSyncTime, lastSyncMessage, lastSyncSuccess);
    }

    public record SyncResult(boolean success, String message) {}

    public record VerboseSyncResult(boolean success, String message, java.util.List<String> log) {}

    public record SyncStatus(Instant lastSyncTime, String message, Boolean success) {}
}
