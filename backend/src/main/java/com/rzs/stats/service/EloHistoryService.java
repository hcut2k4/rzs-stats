package com.rzs.stats.service;

import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.repository.GameRepository;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class EloHistoryService {
    private final GameRepository repository;
    private final EloConfigService configs;
    private final EloService engine;
    private final OwnerChangeService ownerChanges;

    public EloHistoryService(GameRepository repository, EloConfigService configs, EloService engine, OwnerChangeService ownerChanges) {
        this.repository = repository;
        this.configs = configs;
        this.engine = engine;
        this.ownerChanges = ownerChanges;
    }

    @Cacheable(value = "eloHistory", sync = true)
    public EloService.Timeline getTimeline() {
        List<EloService.Game> games = new ArrayList<>();
        Map<Integer, EloService.Team> teams = new TreeMap<>();
        for (GameEntity game : repository.findAllForElo()) {
            if (game.getStageIndex() == null || game.getStageIndex() < 1) continue;
            if (validTeam(game.getHomeTeam())) teams.put(game.getHomeTeam().getTeamId(), team(game.getHomeTeam()));
            if (validTeam(game.getAwayTeam())) teams.put(game.getAwayTeam().getTeamId(), team(game.getAwayTeam()));
            if (game.getSeasonIndex() == null || game.getWeekIndex() == null
                    || game.getStatus() == null || game.getStatus() < 2
                    || game.getHomeScore() == null || game.getAwayScore() == null
                    || !validTeam(game.getHomeTeam()) || !validTeam(game.getAwayTeam())
                    || game.getHomeTeam().getTeamId().equals(game.getAwayTeam().getTeamId())
                    || (game.getId() == null && game.getGameId() == null)) continue;
            games.add(new EloService.Game(game.getGameId(), game.getId(), game.getSeasonIndex(), game.getStageIndex(),
                    game.getWeekIndex(), team(game.getHomeTeam()), team(game.getAwayTeam()), game.getHomeScore(), game.getAwayScore()));
        }
        return engine.compute(games, teams.values(), configs.get(), ownerChanges.list());
    }

    private boolean validTeam(TeamEntity team) {
        return team != null && team.getTeamId() != null;
    }

    private EloService.Team team(TeamEntity team) {
        return new EloService.Team(team.getTeamId(), team.getAbbrName(), team.getDisplayName());
    }
}
