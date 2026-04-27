package com.rzs.stats.service;

import com.rzs.stats.model.dto.GameDto;
import com.rzs.stats.model.dto.SeasonWeekDto;
import com.rzs.stats.model.dto.StandingDto;
import com.rzs.stats.model.dto.TeamDto;
import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.repository.TeamRepository;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class StatsService {

    private final GameRepository gameRepository;
    private final TeamRepository teamRepository;

    public StatsService(GameRepository gameRepository, TeamRepository teamRepository) {
        this.gameRepository = gameRepository;
        this.teamRepository = teamRepository;
    }

    // -------------------------------------------------------------------------
    // Standings
    // -------------------------------------------------------------------------

    @Cacheable("standings")
    public List<StandingDto> computeStandings(int seasonIndex) {
        List<GameEntity> games = regularSeasonGames(seasonIndex);
        List<TeamEntity> teams = teamRepository.findAll();

        Map<Integer, TeamStats> statsMap = computeTeamStats(teams, games);

        // Pre-season SoS: use previous season regular-season games (excl H2H from that season)
        List<GameEntity> prevGames = seasonIndex > 0 ? regularSeasonGames(seasonIndex - 1) : List.of();
        Map<Integer, TeamStats> prevStatsMap = computeTeamStats(teams, prevGames);

        // Build per-team map of remaining (future) opponent IDs
        List<GameEntity> futureGames = gameRepository.findFutureRegularSeasonGames(seasonIndex);
        Map<Integer, Set<Integer>> remainingOpps = new HashMap<>();
        Map<Integer, Integer> remainingGameCount = new HashMap<>();
        for (GameEntity g : futureGames) {
            if (g.getHomeTeam() == null || g.getAwayTeam() == null) continue;
            int h = g.getHomeTeam().getTeamId(), a = g.getAwayTeam().getTeamId();
            remainingOpps.computeIfAbsent(h, k -> new HashSet<>()).add(a);
            remainingOpps.computeIfAbsent(a, k -> new HashSet<>()).add(h);
            remainingGameCount.merge(h, 1, Integer::sum);
            remainingGameCount.merge(a, 1, Integer::sum);
        }

        return teams.stream().map(team -> {
            TeamStats curr = statsMap.getOrDefault(team.getTeamId(), new TeamStats());
            return buildStandingDto(team, curr, statsMap, prevStatsMap, remainingOpps, remainingGameCount);
        }).sorted(Comparator.comparingDouble(StandingDto::getWinPct).reversed())
          .collect(Collectors.toList());
    }

    private StandingDto buildStandingDto(TeamEntity team, TeamStats curr,
                                          Map<Integer, TeamStats> currAll,
                                          Map<Integer, TeamStats> prevAll,
                                          Map<Integer, Set<Integer>> remainingOpps,
                                          Map<Integer, Integer> remainingGameCount) {
        double pyPat = calculatePyPat(curr.pf, curr.pa, curr.games);

        // Played SoS: already-played opponents' PyPAT using current or previous season stats
        double oppPyPatCurr = calculateOppPyPat(team.getTeamId(), curr.opponentIds, currAll);
        double oppPyPatPrev = calculateOppPyPat(team.getTeamId(), curr.opponentIds, prevAll);

        // Win Diff: actual wins minus PyPAT-expected wins
        double actualWins   = curr.wins + 0.5 * curr.ties;
        double expectedWins = pyPat * curr.games;
        double winDiff = Math.round((actualWins - expectedWins) * 10.0) / 10.0;

        // Remaining SoS: future opponents' PyPAT using current or previous season stats
        Set<Integer> remOpps = remainingOpps.getOrDefault(team.getTeamId(), Set.of());
        Double oppPyPatRemainingCurr = remOpps.isEmpty() ? null
                : round(calculateOppPyPat(team.getTeamId(), remOpps, currAll));
        Double oppPyPatRemainingPrev = remOpps.isEmpty() ? null
                : round(calculateOppPyPat(team.getTeamId(), remOpps, prevAll));

        // Total SoS: game-count-weighted average of played and remaining SoS.
        // Using a simple union of unique opponents would let weak played-only opponents
        // drag Total below both Played and Left; weighting by game count is correct.
        int gamesPlayed = curr.games;
        int gamesLeft   = remainingGameCount.getOrDefault(team.getTeamId(), 0);
        int totalGames  = gamesPlayed + gamesLeft;

        Double oppPyPatTotalCurr;
        Double oppPyPatTotalPrev;
        if (totalGames == 0) {
            oppPyPatTotalCurr = null;
            oppPyPatTotalPrev = null;
        } else if (gamesLeft == 0) {
            oppPyPatTotalCurr = round(oppPyPatCurr);
            oppPyPatTotalPrev = round(oppPyPatPrev);
        } else if (gamesPlayed == 0) {
            oppPyPatTotalCurr = oppPyPatRemainingCurr;
            oppPyPatTotalPrev = oppPyPatRemainingPrev;
        } else {
            double remCurr = oppPyPatRemainingCurr != null ? oppPyPatRemainingCurr : 0.0;
            double remPrev = oppPyPatRemainingPrev != null ? oppPyPatRemainingPrev : 0.0;
            oppPyPatTotalCurr = round((oppPyPatCurr * gamesPlayed + remCurr * gamesLeft) / totalGames);
            oppPyPatTotalPrev = round((oppPyPatPrev * gamesPlayed + remPrev * gamesLeft) / totalGames);
        }

        StandingDto dto = new StandingDto();
        dto.setTeamId(team.getTeamId());
        dto.setDisplayName(team.getDisplayName());
        dto.setAbbrName(team.getAbbrName());
        dto.setCityName(team.getCityName());
        dto.setConference(team.getConference());
        dto.setDivision(team.getDivision());
        dto.setPrimaryColor(team.getPrimaryColor());
        dto.setLogoId(team.getLogoId());
        dto.setWins(curr.wins);
        dto.setLosses(curr.losses);
        dto.setTies(curr.ties);
        dto.setGamesPlayed(curr.games);
        dto.setPointsFor(curr.pf);
        dto.setPointsAgainst(curr.pa);
        double winPct = curr.games > 0 ? (curr.wins + 0.5 * curr.ties) / curr.games : 0.0;
        dto.setWinPct(round(winPct));
        dto.setPythagoreanPat(round(pyPat));
        dto.setWinDiff(winDiff);
        dto.setOppPyPatCurr(round(oppPyPatCurr));
        dto.setOppPyPatPrev(round(oppPyPatPrev));
        dto.setOppPyPatRemainingCurr(oppPyPatRemainingCurr);
        dto.setOppPyPatRemainingPrev(oppPyPatRemainingPrev);
        dto.setOppPyPatTotalCurr(oppPyPatTotalCurr);
        dto.setOppPyPatTotalPrev(oppPyPatTotalPrev);
        return dto;
    }

    // -------------------------------------------------------------------------
    // PyPat formula (ported from old Java app)
    // -------------------------------------------------------------------------

    static double calculatePyPat(int pf, int pa, int games) {
        if (games == 0 || (pf == 0 && pa == 0)) return 0.0;
        if (pa == 0) return 1.0;
        if (pf == 0) return 0.0;
        double base = (pf + (double) pa) / games;
        double exponent = Math.pow(base, 0.251);
        double pfExp = Math.pow(pf, exponent);
        double paExp = Math.pow(pa, exponent);
        return pfExp / (pfExp + paExp);
    }

    // For each opponent faced, compute their PyPat from allStats excluding H2H games.
    // allStats already has per-team stats computed without H2H (we pass the right map).
    private double calculateOppPyPat(int teamId, Set<Integer> opponentIds,
                                      Map<Integer, TeamStats> allStats) {
        if (opponentIds.isEmpty() || allStats.isEmpty()) return 0.0;

        List<Double> pyPats = new ArrayList<>();
        for (Integer oppId : opponentIds) {
            TeamStats oppStats = allStats.get(oppId);
            if (oppStats == null) continue;

            // Exclude head-to-head: get opp stats minus games against this team
            int[] adjusted = oppStats.statsExcluding(teamId);
            int adjPf = adjusted[0], adjPa = adjusted[1], adjGames = adjusted[2];
            if (adjGames > 0) {
                pyPats.add(calculatePyPat(adjPf, adjPa, adjGames));
            }
        }
        return pyPats.stream().mapToDouble(d -> d).average().orElse(0.0);
    }

    // -------------------------------------------------------------------------
    // Team stats computation
    // -------------------------------------------------------------------------

    private Map<Integer, TeamStats> computeTeamStats(List<TeamEntity> teams, List<GameEntity> games) {
        Map<Integer, TeamStats> map = new HashMap<>();
        for (TeamEntity t : teams) {
            map.put(t.getTeamId(), new TeamStats());
        }
        for (GameEntity g : games) {
            if (g.getHomeTeam() == null || g.getAwayTeam() == null) continue;
            int homeId = g.getHomeTeam().getTeamId();
            int awayId = g.getAwayTeam().getTeamId();
            int hs = g.getHomeScore() != null ? g.getHomeScore() : 0;
            int as = g.getAwayScore() != null ? g.getAwayScore() : 0;

            map.computeIfAbsent(homeId, k -> new TeamStats()).addGame(hs, as, awayId);
            map.computeIfAbsent(awayId, k -> new TeamStats()).addGame(as, hs, homeId);
        }
        return map;
    }

    // -------------------------------------------------------------------------
    // Games
    // -------------------------------------------------------------------------

    @Cacheable("games")
    public List<GameDto> getGames(int seasonIndex, int stageIndex, int weekIndex) {
        return gameRepository.findBySeasonIndexAndStageIndexAndWeekIndex(seasonIndex, stageIndex, weekIndex)
                .stream().map(this::toGameDto).collect(Collectors.toList());
    }

    @Cacheable("seasons")
    public List<Integer> getAvailableSeasons() {
        return gameRepository.findDistinctSeasonIndicesWithMinGames(1);
    }

    @Cacheable("weeks")
    public List<Integer> getAvailableWeeks(int seasonIndex, int stageIndex) {
        return gameRepository.findDistinctRegularSeasonWeeks(seasonIndex, stageIndex);
    }

    // -------------------------------------------------------------------------
    // Trends: season-over-season
    // -------------------------------------------------------------------------

    @Cacheable("seasonTrends")
    public List<SeasonWeekDto> getSeasonTrends() {
        List<Integer> seasons = gameRepository.findDistinctSeasonIndicesWithMinGames(10);
        List<TeamEntity> teams = teamRepository.findAll();
        List<SeasonWeekDto> result = new ArrayList<>();

        for (int season : seasons) {
            List<GameEntity> games = regularSeasonGames(season);
            Map<Integer, TeamStats> statsMap = computeTeamStats(teams, games);
            List<StandingDto> standings = teams.stream().map(t -> {
                TeamStats s = statsMap.getOrDefault(t.getTeamId(), new TeamStats());
                StandingDto dto = new StandingDto();
                dto.setTeamId(t.getTeamId());
                dto.setDisplayName(t.getDisplayName());
                dto.setAbbrName(t.getAbbrName());
                dto.setPrimaryColor(t.getPrimaryColor());
                dto.setConference(t.getConference());
                dto.setDivision(t.getDivision());
                dto.setWins(s.wins);
                dto.setLosses(s.losses);
                dto.setTies(s.ties);
                dto.setGamesPlayed(s.games);
                dto.setPointsFor(s.pf);
                dto.setPointsAgainst(s.pa);
                double winPct = s.games > 0 ? (s.wins + 0.5 * s.ties) / s.games : 0.0;
                dto.setWinPct(round(winPct));
                double pyPat = calculatePyPat(s.pf, s.pa, s.games);
                dto.setPythagoreanPat(round(pyPat));
                double actualWins = s.wins + 0.5 * s.ties;
                double winDiff = Math.round((actualWins - pyPat * s.games) * 10.0) / 10.0;
                dto.setWinDiff(winDiff);
                return dto;
            }).sorted(Comparator.comparingDouble(StandingDto::getWinPct).reversed())
              .collect(Collectors.toList());
            result.add(new SeasonWeekDto(season, null, standings));
        }
        return result;
    }

    // -------------------------------------------------------------------------
    // Trends: week-by-week within a season
    // -------------------------------------------------------------------------

    @Cacheable("weeklyTrends")
    public List<SeasonWeekDto> getWeeklyTrends(int seasonIndex) {
        List<Integer> weeks = gameRepository.findDistinctRegularSeasonWeeks(seasonIndex, 1);
        List<TeamEntity> teams = teamRepository.findAll();
        List<GameEntity> allGames = regularSeasonGames(seasonIndex);
        List<SeasonWeekDto> result = new ArrayList<>();

        for (int week : weeks) {
            // Cumulative: all games up through this week
            List<GameEntity> gamesThruWeek = allGames.stream()
                    .filter(g -> g.getWeekIndex() <= week)
                    .collect(Collectors.toList());
            Map<Integer, TeamStats> statsMap = computeTeamStats(teams, gamesThruWeek);
            List<StandingDto> standings = teams.stream().map(t -> {
                TeamStats s = statsMap.getOrDefault(t.getTeamId(), new TeamStats());
                StandingDto dto = new StandingDto();
                dto.setTeamId(t.getTeamId());
                dto.setDisplayName(t.getDisplayName());
                dto.setAbbrName(t.getAbbrName());
                dto.setPrimaryColor(t.getPrimaryColor());
                dto.setConference(t.getConference());
                dto.setDivision(t.getDivision());
                dto.setWins(s.wins);
                dto.setLosses(s.losses);
                dto.setTies(s.ties);
                dto.setGamesPlayed(s.games);
                dto.setPointsFor(s.pf);
                dto.setPointsAgainst(s.pa);
                double winPct = s.games > 0 ? (s.wins + 0.5 * s.ties) / s.games : 0.0;
                dto.setWinPct(round(winPct));
                dto.setPythagoreanPat(round(calculatePyPat(s.pf, s.pa, s.games)));
                return dto;
            }).sorted(Comparator.comparingDouble(StandingDto::getWinPct).reversed())
              .collect(Collectors.toList());
            result.add(new SeasonWeekDto(seasonIndex, week, standings));
        }
        return result;
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private List<GameEntity> regularSeasonGames(int seasonIndex) {
        return gameRepository.findRegularSeasonGames(
                seasonIndex,
                GameRepository.REGULAR_SEASON_STAGE,
                GameRepository.REGULAR_SEASON_MIN_WEEK,
                GameRepository.REGULAR_SEASON_MAX_WEEK);
    }

    private GameDto toGameDto(GameEntity g) {
        GameDto dto = new GameDto();
        dto.setGameId(g.getGameId());
        dto.setNsPk(g.getNsPk());
        dto.setSeasonIndex(g.getSeasonIndex());
        dto.setStageIndex(g.getStageIndex());
        dto.setWeekIndex(g.getWeekIndex());
        dto.setHomeScore(g.getHomeScore());
        dto.setAwayScore(g.getAwayScore());
        dto.setStatus(g.getStatus());
        dto.setSimmed(g.getSimmed());
        if (g.getHomeTeam() != null) dto.setHomeTeam(toTeamDto(g.getHomeTeam()));
        if (g.getAwayTeam() != null) dto.setAwayTeam(toTeamDto(g.getAwayTeam()));
        return dto;
    }

    private TeamDto toTeamDto(TeamEntity t) {
        return new TeamDto(t.getTeamId(), t.getDisplayName(), t.getAbbrName(),
                t.getCityName(), t.getConference(), t.getPrimaryColor(), t.getLogoId());
    }

    private static double round(double val) {
        return Math.round(val * 10000.0) / 10000.0;
    }

    // -------------------------------------------------------------------------
    // Inner class: mutable per-team stats accumulator
    // -------------------------------------------------------------------------

    static class TeamStats {
        int wins, losses, ties, pf, pa, games;
        // Map: opponentTeamId -> [opponentPF, opponentPA, gamesAgainstOpp]
        // Used to subtract H2H when computing SoS
        Map<Integer, int[]> h2h = new HashMap<>();
        Set<Integer> opponentIds = new HashSet<>();

        void addGame(int teamScore, int oppScore, int oppTeamId) {
            pf += teamScore;
            pa += oppScore;
            games++;
            opponentIds.add(oppTeamId);
            // Track head-to-head: from THIS team's perspective, opp scored oppScore against team
            // We need to know opp's perspective later, so track (oppTeamId -> opp's PF in H2H, opp's PA in H2H)
            // opp's PF in H2H = oppScore; opp's PA in H2H = teamScore
            h2h.computeIfAbsent(oppTeamId, k -> new int[3]);
            h2h.get(oppTeamId)[0] += oppScore;  // opp's PF in H2H
            h2h.get(oppTeamId)[1] += teamScore; // opp's PA in H2H
            h2h.get(oppTeamId)[2]++;             // games against opp
            if (teamScore > oppScore) wins++;
            else if (teamScore < oppScore) losses++;
            else ties++;
        }

        // Returns [adjPF, adjPA, adjGames] for this team EXCLUDING games against excludeTeamId.
        // h2h[opp][0] = opp's PF in H2H (what opp scored = this team's PA in H2H)
        // h2h[opp][1] = opp's PA in H2H (what this team scored = this team's PF in H2H)
        int[] statsExcluding(int excludeTeamId) {
            int[] hth = h2h.get(excludeTeamId);
            if (hth == null) return new int[]{pf, pa, games};
            return new int[]{pf - hth[1], pa - hth[0], games - hth[2]};
        }
    }
}
