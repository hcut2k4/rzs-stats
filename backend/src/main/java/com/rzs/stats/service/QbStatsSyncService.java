package com.rzs.stats.service;

import com.rzs.stats.client.NeonSportzClient;
import com.rzs.stats.model.entity.QbGameStatEntity;
import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.model.entity.TeamGameStatEntity;
import com.rzs.stats.model.ns.NsKickingStat;
import com.rzs.stats.model.ns.NsPuntingStat;
import com.rzs.stats.model.ns.NsPassingStat;
import com.rzs.stats.model.ns.NsRushingStat;
import com.rzs.stats.model.ns.NsTeamStat;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.repository.QbGameStatRepository;
import com.rzs.stats.repository.TeamGameStatRepository;
import com.rzs.stats.repository.TeamRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;
import java.util.function.Function;
import java.util.function.ToIntFunction;

@Service
public class QbStatsSyncService {
    private static final Logger log = LoggerFactory.getLogger(QbStatsSyncService.class);
    private final NeonSportzClient client;
    private final GameRepository games;
    private final TeamRepository teams;
    private final QbGameStatRepository repository;
    private final TeamGameStatRepository teamRepository;
    private final QbStatsWeekWriter writer;
    private volatile Status status = new Status(false, null, null, null);

    public QbStatsSyncService(NeonSportzClient client, GameRepository games, TeamRepository teams,
                              QbGameStatRepository repository, TeamGameStatRepository teamRepository, QbStatsWeekWriter writer) {
        this.client = client;
        this.games = games;
        this.teams = teams;
        this.repository = repository;
        this.teamRepository = teamRepository;
        this.writer = writer;
    }

    public record Status(boolean inProgress, String message, Instant completedAt, Boolean success) {}
    public Status getStatus() { return status; }
    public void syncIncremental() { sync(false); }
    public void syncAll() { sync(true); }

    private synchronized boolean begin() {
        if (status.inProgress()) return false;
        status = new Status(true, "QB sync started", null, null);
        return true;
    }

    private void sync(boolean full) {
        if (!begin()) return;
        try {
            int current = client.fetchLeagueInfo().getSeason();
            Map<String, TeamEntity> byAbbr = teams.findAll().stream().collect(Collectors.toMap(TeamEntity::getAbbrName, t -> t));
            int weeksSynced = 0;
            for (int season = 0; season <= current; season++) {
                List<GameEntity> completed = games.findCompletedInScope(season, 0, 22);
                List<Integer> weeks = completed.stream().map(g -> g.getWeekIndex()).distinct().sorted().toList();
                int latest = weeks.stream().mapToInt(Integer::intValue).max().orElse(-1);
                for (int week : weeks) {
                    Set<String> completedTeams = new HashSet<>();
                    completed.stream().filter(g -> g.getWeekIndex() == week).forEach(g -> {
                        if (g.getHomeTeam() != null) completedTeams.add(g.getHomeTeam().getAbbrName());
                        if (g.getAwayTeam() != null) completedTeams.add(g.getAwayTeam().getAbbrName());
                    });
                    if (!full && !(season == current && week == latest)
                            && repository.existsBySeasonIndexAndStageIndexAndWeekIndex(season, 1, week)
                            && teamRepository.countBySeasonIndexAndStageIndexAndWeekIndex(season, 1, week) >= completedTeams.size()) continue;
                    status = new Status(true, "Syncing QB season " + season + ", week " + week, null, null);
                    List<NsPassingStat> passing = client.fetchPassingStats(season, 1, week);
                    List<NsRushingStat> rushing = client.fetchRushingStats(season, 1, week);
                    List<NsTeamStat> teamStats = client.fetchTeamsStats(season, 1, week);
                    List<NsKickingStat> kicking = client.fetchKickingStats(season, 1, week);
                    List<NsPuntingStat> punting = client.fetchPuntingStats(season, 1, week);
                    writer.replaceWeek(season, 1, week, buildRows(season, week, passing, rushing, teamStats, byAbbr, completedTeams),
                            buildTeamRows(season, week, passing, rushing, teamStats, kicking, punting, byAbbr, completedTeams));
                    weeksSynced++;
                }
            }
            status = new Status(false, weeksSynced + " QB weeks synced", Instant.now(), true);
        } catch (Exception e) {
            status = new Status(false, "QB sync failed: " + e.getMessage(), Instant.now(), false);
            log.error("QB sync failed", e);
        }
    }

    List<QbGameStatEntity> buildRows(int season, int week, List<NsPassingStat> passing, List<NsRushingStat> rushing,
                                    List<NsTeamStat> teamStats, Map<String, TeamEntity> teams, Set<String> completedTeams) {
        var deduped = dedupeWeeklyStats(passing, rushing, teamStats);
        passing = deduped.passing();
        rushing = deduped.rushing();
        Map<String, Integer> passerYards = new HashMap<>();
        Map<String, Integer> fumbles = new HashMap<>();
        Map<String, NsTeamStat> contexts = teamStats.stream().collect(Collectors.toMap(t -> t.team__abbrName, t -> t));
        passing.forEach(p -> passerYards.merge(p.team__abbrName, p.passTotalYds, Integer::sum));
        rushing.forEach(r -> fumbles.merge(r.team__abbrName, r.rushTotalFum, Integer::sum));
        Map<String, QbGameStatEntity> rows = new LinkedHashMap<>();
        for (NsPassingStat p : passing) if ("QB".equals(p.player__position) && completedTeams.contains(p.team__abbrName)) {
            QbGameStatEntity row = rows.computeIfAbsent(p.player__rosterId,
                    id -> newRow(id, p.player__fullName, p.team__abbrName, teams, season, week));
            row.setPassAtt(p.passTotalAtt);
            row.setPassComp(p.passTotalComp);
            row.setPassYds(p.passTotalYds);
            row.setPassTd(p.passTotalTDs);
            row.setPassInt(p.passTotalInts);
            row.setPassSacks(p.passTotalSacks);
            if (p.passerAvgRating != null && !p.passerAvgRating.isBlank()) row.setPasserRating(Double.valueOf(p.passerAvgRating));
        }
        for (NsRushingStat r : rushing) if ("QB".equals(r.player__position) && completedTeams.contains(r.team__abbrName)) {
            QbGameStatEntity row = rows.computeIfAbsent(r.player__rosterId,
                    id -> newRow(id, r.player__fullName, r.team__abbrName, teams, season, week));
            row.setRushAtt(r.rushTotalAtt);
            row.setRushYds(r.rushTotalYds);
            row.setRushTd(r.rushTotalTDs);
            row.setRushFum(r.rushTotalFum);
        }
        for (QbGameStatEntity row : rows.values()) {
            String abbr = row.getTeam().getAbbrName();
            NsTeamStat context = Objects.requireNonNull(contexts.get(abbr), "Missing team stats for " + abbr);
            row.setTeamPasserYards(passerYards.getOrDefault(abbr, 0));
            row.setTeamNetPassYds(context.offTotalPassYds);
            row.setTeamSacks(context.offTotalSacks);
            row.setTeamFumbles(fumbles.getOrDefault(abbr, 0));
            row.setTeamFumblesLost(context.offTotalFumLost);
        }
        return new ArrayList<>(rows.values());
    }

    List<TeamGameStatEntity> buildTeamRows(int season, int week, List<NsPassingStat> passing, List<NsRushingStat> rushing,
                                           List<NsTeamStat> teamStats, List<NsKickingStat> kicking, List<NsPuntingStat> punting,
                                           Map<String, TeamEntity> teams, Set<String> completedTeams) {
        var deduped = dedupeWeeklyStats(passing, rushing, teamStats);
        passing = deduped.passing();
        rushing = deduped.rushing();
        Map<String, Integer> passAtt = new HashMap<>();
        Map<String, Integer> rushAtt = new HashMap<>();
        Map<String, Integer> punts = new HashMap<>();
        Map<String, int[]> kicks = new HashMap<>();
        passing.forEach(p -> passAtt.merge(p.team__abbrName, p.passTotalAtt, Integer::sum));
        rushing.forEach(r -> rushAtt.merge(r.team__abbrName, r.rushTotalAtt, Integer::sum));
        punting.forEach(p -> punts.merge(p.team__abbrName, p.puntTotalAtt, Integer::sum));
        for (NsKickingStat k : kicking) {
            int[] sums = kicks.computeIfAbsent(k.team__abbrName, a -> new int[4]);
            sums[0] += k.fGTotalAtt;
            sums[1] += k.fGTotalMade;
            sums[2] += k.xPTotalAtt;
            sums[3] += k.xPTotalMade;
        }
        List<TeamGameStatEntity> rows = new ArrayList<>();
        for (NsTeamStat t : teamStats) {
            String abbr = t.team__abbrName;
            if (!completedTeams.contains(abbr)) continue;
            TeamGameStatEntity row = new TeamGameStatEntity();
            row.setTeam(Objects.requireNonNull(teams.get(abbr), "Unknown team " + abbr));
            row.setSeasonIndex(season);
            row.setStageIndex(1);
            row.setWeekIndex(week);
            row.setPassAtt(passAtt.getOrDefault(abbr, 0));
            row.setRushAtt(rushAtt.getOrDefault(abbr, 0));
            row.setPunts(punts.getOrDefault(abbr, 0));
            int[] k = kicks.getOrDefault(abbr, new int[4]);
            row.setFgAtt(k[0]);
            row.setFgMade(k[1]);
            row.setXpAtt(k[2]);
            row.setXpMade(k[3]);
            row.setSacks(t.offTotalSacks);
            row.setTotalYds(t.offTotalTotalYds);
            row.setFirstDowns(t.offTotal1stDowns);
            row.setThirdAtt(t.offTotal3rdDownAtt);
            row.setThirdConv(t.offTotal3rdDownConv);
            row.setFourthAtt(t.offTotal4thDownAtt);
            row.setFourthConv(t.offTotal4thDownConv);
            row.setRedZones(t.offTotalRedZones);
            row.setRedZoneTds(t.offTotalRedZoneTDs);
            row.setPassTds(t.offTotalPassTDs);
            row.setRushTds(t.offTotalRushTDs);
            row.setIntsLost(t.offTotalIntsLost);
            row.setFumLost(t.offTotalFumLost);
            row.setTwoPtAtt(t.offTotal2PtAtt);
            row.setTwoPtConv(t.offTotal2PtConv);
            rows.add(row);
        }
        return rows;
    }

    record WeeklyStats(List<NsPassingStat> passing, List<NsRushingStat> rushing) {}

    WeeklyStats dedupeWeeklyStats(List<NsPassingStat> passing, List<NsRushingStat> rushing, List<NsTeamStat> teamStats) {
        Map<String, NsTeamStat> contexts = teamStats.stream().collect(Collectors.toMap(t -> t.team__abbrName, t -> t));
        passing = dedupeByPlayer(passing, p -> p.player__rosterId, p -> p.team__abbrName, p -> p.passTotalYds,
                abbr -> contexts.containsKey(abbr) ? contexts.get(abbr).offTotalPassYds : null, Map.of());
        Map<String, String> passingTeams = passing.stream().collect(Collectors.toMap(p -> p.player__rosterId, p -> p.team__abbrName));
        rushing = dedupeByPlayer(rushing, r -> r.player__rosterId, r -> r.team__abbrName, r -> r.rushTotalYds,
                abbr -> contexts.containsKey(abbr) ? contexts.get(abbr).offTotalRushYds : null, passingTeams);
        return new WeeklyStats(passing, rushing);
    }

    private <T> List<T> dedupeByPlayer(List<T> stats, Function<T, String> rosterId, Function<T, String> team,
                                      ToIntFunction<T> yards, Function<String, Integer> teamYards, Map<String, String> preferredTeams) {
        Map<String, Integer> rawYards = new HashMap<>();
        stats.forEach(s -> rawYards.merge(team.apply(s), yards.applyAsInt(s), Integer::sum));
        Map<String, T> selected = new LinkedHashMap<>();
        Map<String, Long> distances = new HashMap<>();
        for (T stat : stats) {
            String id = rosterId.apply(stat);
            String abbr = team.apply(stat);
            Integer target = teamYards.apply(abbr);
            long distance = preferredTeams.containsKey(id) ? (abbr.equals(preferredTeams.get(id)) ? 0 : Long.MAX_VALUE)
                    : target != null ? Math.abs((long) rawYards.get(abbr) - target) : Long.MAX_VALUE;
            if (!selected.containsKey(id) || distance < distances.get(id)) {
                selected.put(id, stat);
                distances.put(id, distance);
            }
        }
        return new ArrayList<>(selected.values());
    }

    private QbGameStatEntity newRow(String id, String name, String abbr, Map<String, TeamEntity> teams, int season, int week) {
        if (id == null || id.isBlank() || name == null) throw new IllegalArgumentException("Missing QB identity");
        QbGameStatEntity row = new QbGameStatEntity();
        row.setRosterId(id);
        row.setPlayerName(name);
        row.setTeam(Objects.requireNonNull(teams.get(abbr), "Unknown team " + abbr));
        row.setSeasonIndex(season);
        row.setStageIndex(1);
        row.setWeekIndex(week);
        return row;
    }
}
