package com.rzs.stats.service;

import com.rzs.stats.repository.QbGameStatRepository;
import com.rzs.stats.repository.TeamGameStatRepository;
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
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class SyncService {

    private static final Logger log = LoggerFactory.getLogger(SyncService.class);

    private final NeonSportzClient client;
    private final TeamRepository teamRepository;
    private final GameRepository gameRepository;
    private final QbGameStatRepository qbRepository;
    private final TeamGameStatRepository teamStatRepository;

    private final SyncStatusService persistedStatus;

    private Instant lastSyncTime;
    private String lastSyncMessage;
    private boolean lastSyncSuccess;

    public SyncService(NeonSportzClient client, TeamRepository teamRepository, GameRepository gameRepository, QbGameStatRepository qbRepository,
                       TeamGameStatRepository teamStatRepository, SyncStatusService persistedStatus) {
        this.persistedStatus = persistedStatus;
        this.client = client;
        this.qbRepository = qbRepository;
        this.teamStatRepository = teamStatRepository;
        this.teamRepository = teamRepository;
        this.gameRepository = gameRepository;
    }

    public List<Integer> refreshWindow(int season) {
        var window = quickWindow(season);
        if (!window.isEmpty()) return window;
        return gameRepository.findBySeasonIndex(season).stream().filter(g -> Integer.valueOf(1).equals(g.getStageIndex()))
                .map(GameEntity::getWeekIndex).distinct().sorted(java.util.Comparator.reverseOrder()).limit(2).toList();
    }

    @Transactional
    public SyncResult sync(NsLeague league, boolean quick, boolean force) {
        int changed = 0;
        Set<Week> changedWeeks = new java.util.HashSet<>();
        List<String> details = new ArrayList<>();
        details.add("[LEAGUE] season=" + league.getSeason() + ", stage=" + league.getStage() + ", week=" + league.getWeek());
        try {
            int current = league.getSeason();
            List<TeamEntity> storedTeams = teamRepository.findAll();
            Map<Integer, TeamEntity> byId = new HashMap<>();
            Map<Integer, TeamEntity> byNsId = new HashMap<>();
            storedTeams.forEach(t -> { byId.put(t.getTeamId(), t); byNsId.put(t.getNsId(), t); });
            List<NsGame> incoming = new ArrayList<>();
            if (quick) {
                List<Integer> window = quickWindow(current);
                if (window.isEmpty()) incoming.addAll(client.fetchAllGamesForSeason(current));
                else for (int week : window) incoming.addAll(client.fetchGamesForWeek(current, week));
                if (incoming.stream().anyMatch(g -> (g.getHomeTeam() != null && resolveTeam(g.getHomeTeam(), byId, byNsId) == null)
                        || (g.getAwayTeam() != null && resolveTeam(g.getAwayTeam(), byId, byNsId) == null))) quick = false;
            }
            if (!quick) {
                List<NsTeam> nsTeams = client.fetchAllTeams();
                Set<Integer> ids = nsTeams.stream().map(NsTeam::getTeamId).collect(Collectors.toSet());
                if (!storedTeams.isEmpty() && !ids.isEmpty() && storedTeams.stream().noneMatch(t -> ids.contains(t.getTeamId()))) {
                    qbRepository.deleteAllInBatch();
                    teamStatRepository.deleteAllInBatch();
                    gameRepository.deleteAllInBatch();
                    teamRepository.deleteAllInBatch();
                    byId.clear(); byNsId.clear(); changed++;
                    details.add("[PURGE] League replaced; removed stored games and teams");
                }
                for (NsTeam ns : nsTeams) {
                    TeamEntity team = byId.getOrDefault(ns.getTeamId(), new TeamEntity());
                    if (team.getId() == null || !Objects.equals(team.getNsId(), ns.getId())
                            || !Objects.equals(team.getDisplayName(), ns.getDisplayName())
                            || !Objects.equals(team.getNickname(), ns.getNickName())
                            || !Objects.equals(team.getCityName(), ns.getCityName())
                            || !Objects.equals(team.getAbbrName(), ns.getAbbrName())
                            || !Objects.equals(team.getConference(), ns.getConferenceName())
                            || !Objects.equals(team.getDivision(), ns.getDivisionName())
                            || !Objects.equals(team.getPrimaryColor(), ns.getPrimaryColor())
                            || !Objects.equals(team.getLogoId(), ns.getLogoId())) {
                        team.setTeamId(ns.getTeamId()); team.setNsId(ns.getId());
                        team.setDisplayName(ns.getDisplayName()); team.setNickname(ns.getNickName());
                        team.setCityName(ns.getCityName()); team.setAbbrName(ns.getAbbrName());
                        team.setConference(ns.getConferenceName()); team.setDivision(ns.getDivisionName());
                        team.setPrimaryColor(ns.getPrimaryColor()); team.setLogoId(ns.getLogoId());
                        teamRepository.save(team); changed++;
                        details.add("[TEAM] Updated " + ns.getDisplayName() + " (teamId=" + ns.getTeamId() + ")");
                    }
                    byId.put(team.getTeamId(), team); byNsId.put(team.getNsId(), team);
                }
                incoming.clear();
                for (int season = 0; season <= current; season++) {
                    if (!force && season < current && gameRepository.countBySeasonIndex(season) > 0) continue;
                    incoming.addAll(client.fetchAllGamesForSeason(season));
                }
            }
            Map<Integer, Map<Integer, GameEntity>> existing = new HashMap<>();
            for (NsGame game : incoming) existing.computeIfAbsent(game.getSeasonIndex(), season -> gameRepository.findBySeasonIndex(season)
                    .stream().collect(Collectors.toMap(GameEntity::getGameId, g -> g)));
            var newPks = incoming.stream().filter(g -> !existing.get(g.getSeasonIndex()).containsKey(g.getGameId()))
                    .map(NsGame::getPk).filter(Objects::nonNull).distinct().toList();
            Map<Integer, GameEntity> byPk = newPks.isEmpty() ? Map.of() : gameRepository.findByNsPkIn(newPks).stream()
                    .collect(Collectors.toMap(GameEntity::getNsPk, g -> g));
            for (NsGame game : incoming) {
                if (game.getStatus() == null) continue;
                var seasonGames = existing.get(game.getSeasonIndex());
                if (!seasonGames.containsKey(game.getGameId()) && game.getPk() != null && byPk.containsKey(game.getPk()))
                    seasonGames.put(game.getGameId(), byPk.get(game.getPk()));
                Change outcome = upsertGame(game, seasonGames, byId, byNsId, changedWeeks);
                if (outcome != Change.UNCHANGED) changed++;
                details.add("[GAME] season=" + game.getSeasonIndex() + ", week=" + game.getWeekIndex()
                        + ", gameId=" + game.getGameId() + ": " + outcome);
            }
            lastSyncTime = Instant.now();
            lastSyncMessage = changed == 0 ? "No changes" : changed + " records changed";
            lastSyncSuccess = true;
            if (changed > 0) persistedStatus.successful(current);
            else persistedStatus.checked();
            log.info("Sync completed: {}", lastSyncMessage);
            return new SyncResult(true, lastSyncMessage, changed, Set.copyOf(changedWeeks), List.copyOf(details), !quick);
        } catch (Exception e) {
            persistedStatus.failed();
            lastSyncMessage = "Sync failed: " + e.getMessage();
            lastSyncSuccess = false;
            log.error("Sync failed", e);
            return new SyncResult(false, lastSyncMessage);
        }
    }

    public List<Integer> quickWindow(int season) {
        var games = gameRepository.findBySeasonIndex(season);
        var current = games.stream().filter(g -> Integer.valueOf(1).equals(g.getStageIndex())
                && g.getStatus() != null && g.getStatus() < 2).map(GameEntity::getWeekIndex).min(Integer::compareTo);
        if (current.isEmpty()) return List.of();
        var previous = games.stream().filter(g -> Integer.valueOf(1).equals(g.getStageIndex()) && g.getWeekIndex() < current.get())
                .map(GameEntity::getWeekIndex).max(Integer::compareTo);
        return previous.map(w -> List.of(current.get(), w)).orElseGet(() -> List.of(current.get()));
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

    private Change upsertGame(NsGame ns, Map<Integer, GameEntity> existingByGameId,
                                Map<Integer, TeamEntity> teamsByTeamId,
                                Map<Integer, TeamEntity> teamsByNsId, Set<Week> changedWeeks) {
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
            boolean changed = !Objects.equals(existing.getSeasonIndex(), ns.getSeasonIndex())
                    || !Objects.equals(existing.getStatus(), ns.getStatus())
                    || !Objects.equals(existing.getHomeScore(), ns.getHomeScore())
                    || !Objects.equals(existing.getAwayScore(), ns.getAwayScore())
                    || !Objects.equals(existing.getStageIndex(), ns.getStageIndex())
                    || !Objects.equals(existing.getWeekIndex(), ns.getWeekIndex())
                    || !Objects.equals(existing.getSimmed(), ns.getSimmed())
                    || teamChanged
                    || !Objects.equals(existing.getNsPk(), ns.getPk());
            if (!changed) return Change.UNCHANGED;
        }

        if (!isNew && Integer.valueOf(1).equals(game.getStageIndex())) changedWeeks.add(new Week(game.getSeasonIndex(), game.getWeekIndex()));
        if (Integer.valueOf(1).equals(ns.getStageIndex())) changedWeeks.add(new Week(ns.getSeasonIndex(), ns.getWeekIndex()));
        game.setGameId(ns.getGameId());
        game.setNsPk(ns.getPk());
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
        existingByGameId.put(ns.getGameId(), game);
        return isNew ? Change.NEW : Change.UPDATED;
    }

    public SyncStatus getStatus() { return new SyncStatus(lastSyncTime, lastSyncMessage, lastSyncSuccess); }

    public record Week(int season, int week) {}
    private enum Change { NEW, UPDATED, UNCHANGED }
    public record SyncResult(boolean success, String message, int changed, Set<Week> changedWeeks, List<String> log, boolean full) {
        public SyncResult(boolean success, String message) { this(success, message, 0, Set.of(), List.of(message), false); }
    }
    public record SyncStatus(Instant lastSyncTime, String message, Boolean success) {}
}
