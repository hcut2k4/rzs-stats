package com.rzs.stats.playoffs;

import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.service.EloService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

@Service
public class SeasonStateLoader {
    public record RemainingGame(int gameId, int week, String home, String away, int homeTeamId, int awayTeamId) {}
    public record State(int season, List<PlayoffSeeding.Team> teams, Map<String, EloService.Team> identities,
                        List<PlayoffSeeding.Game> completedGames, List<RemainingGame> remainingGames,
                        Integer throughWeek, Integer nextWeek) {}

    private final GameRepository games;

    public SeasonStateLoader(GameRepository games) {
        this.games = games;
    }

    @Transactional(readOnly = true)
    public State load(Integer season) {
        return load(season, null);
    }

    @Transactional(readOnly = true)
    public State loadAtStart(int season, int week) {
        return load(season, week);
    }

    private State load(Integer season, Integer startWeek) {
        int selected = season == null ? games.findDistinctSeasonIndicesWithMinGames(1).stream()
                .mapToInt(Integer::intValue).max().orElseThrow(() -> missing("No season data")) : season;
        var schedule = games.findBySeasonIndex(selected).stream()
                .filter(g -> g.getStatus() != null && Objects.equals(g.getStageIndex(), 1) && g.getWeekIndex() != null
                        && g.getWeekIndex() >= 0 && g.getWeekIndex() <= 17)
                .sorted(Comparator.comparing(com.rzs.stats.model.entity.GameEntity::getWeekIndex)
                        .thenComparing(com.rzs.stats.model.entity.GameEntity::getGameId)).toList();
        if (schedule.isEmpty()) throw missing("No regular-season data for season " + selected);
        var teams = new TreeMap<String, PlayoffSeeding.Team>();
        var identities = new TreeMap<String, EloService.Team>();
        var completed = new ArrayList<PlayoffSeeding.Game>();
        var remaining = new ArrayList<RemainingGame>();
        for (var game : schedule) {
            for (TeamEntity team : Arrays.asList(game.getHomeTeam(), game.getAwayTeam())) {
                if (team == null || team.getTeamId() == null || blank(team.getAbbrName())
                        || blank(team.getConference()) || blank(team.getDivision())) {
                    throw missing("Incomplete team conference or division data for season " + selected);
                }
                teams.put(team.getAbbrName(), new PlayoffSeeding.Team(team.getAbbrName(), team.getConference(), team.getDivision()));
                identities.put(team.getAbbrName(), new EloService.Team(team.getTeamId(), team.getAbbrName(), team.getDisplayName()));
            }
            String home = game.getHomeTeam().getAbbrName(), away = game.getAwayTeam().getAbbrName();
            if (game.getStatus() != null && game.getStatus() >= 2 && (startWeek == null || game.getWeekIndex() < startWeek)) {
                if (game.getHomeScore() == null || game.getAwayScore() == null
                        || game.getHomeScore() < 0 || game.getAwayScore() < 0) throw missing("Missing or invalid completed game scores");
                completed.add(new PlayoffSeeding.Game(game.getWeekIndex(), home, away, game.getHomeScore(), game.getAwayScore()));
            } else {
                remaining.add(new RemainingGame(game.getGameId(), game.getWeekIndex(), home, away,
                        game.getHomeTeam().getTeamId(), game.getAwayTeam().getTeamId()));
            }
        }
        return new State(selected, List.copyOf(teams.values()), Map.copyOf(identities), List.copyOf(completed),
                List.copyOf(remaining), completed.stream().map(PlayoffSeeding.Game::week).max(Integer::compare).orElse(null),
                startWeek != null ? startWeek : remaining.stream().map(RemainingGame::week).min(Integer::compare).orElse(null));
    }

    private static boolean blank(String value) { return value == null || value.isBlank(); }
    private static ResponseStatusException missing(String message) { return new ResponseStatusException(HttpStatus.NOT_FOUND, message); }
}
