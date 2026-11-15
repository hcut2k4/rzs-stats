package com.rzs.stats.service;

import com.rzs.stats.model.dto.EloDtos;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

@Service
public class EloQueryService {
    private final EloHistoryService history;
    private final EloService engine;

    public EloQueryService(EloHistoryService history, EloService engine) {
        this.history = history;
        this.engine = engine;
    }

    public List<EloDtos.Rating> ratings(Integer season, Integer week) {
        return selected(history.getTimeline(), season, week).stream()
                .sorted(Comparator.comparingInt(EloService.Snapshot::rank))
                .map(s -> new EloDtos.Rating(s.team().teamId(), s.team().abbrName(), s.team().displayName(),
                        round(s.endElo()), s.rank(), round(s.endElo() - s.prevElo()), s.prevRank(), s.prevRank() - s.rank(), s.gamesCounted())).toList();
    }

    public List<EloDtos.History> history(Integer season) {
        return history.getTimeline().history().stream().filter(s -> season == null || s.season() == season)
                .map(s -> new EloDtos.History(s.team().teamId(), s.season(), s.week(), s.seasonStart(),
                        round(s.startElo()), round(s.endElo()), round(s.change()), s.rank())).toList();
    }

    public List<EloDtos.Game> games(Integer season, Integer week, Integer teamId) {
        return history.getTimeline().games().stream()
                .filter(r -> season == null || r.game().season() == season)
                .filter(r -> week == null || r.game().week() == week)
                .filter(r -> teamId == null || r.game().home().teamId() == teamId || r.game().away().teamId() == teamId)
                .map(r -> new EloDtos.Game(r.game().gameId(), r.game().season(), r.game().week(), r.game().home(), r.game().away(),
                        round(r.homePregameElo()), round(r.awayPregameElo()), r.homeWinProbability(), r.awayWinProbability(),
                        r.game().homeScore(), r.game().awayScore(), r.margin(), r.movMultiplier(), round(r.pointsMoved()),
                        round(r.homePostgameElo()), round(r.awayPostgameElo()))).toList();
    }

    public EloDtos.Matchup matchup(int teamA, int teamB, Integer homeTeam) {
        if (teamA == teamB || homeTeam != null && homeTeam != teamA && homeTeam != teamB) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose two different teams and a homeTeam from that matchup");
        }
        EloService.Timeline timeline = history.getTimeline();
        List<EloService.Snapshot> latest = selected(timeline, null, null);
        EloService.Snapshot a = latest.stream().filter(s -> s.team().teamId() == teamA).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown teamA"));
        EloService.Snapshot b = latest.stream().filter(s -> s.team().teamId() == teamB).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown teamB"));
        double advantage = timeline.config().homeFieldAdvantage();
        double p = engine.probability(a.endElo() + (Objects.equals(homeTeam, teamA) ? advantage : 0),
                b.endElo() + (Objects.equals(homeTeam, teamB) ? advantage : 0), timeline.config());
        return new EloDtos.Matchup(a.team(), b.team(), round(a.endElo()), round(b.endElo()), p, 1 - p);
    }

    private List<EloService.Snapshot> selected(EloService.Timeline timeline, Integer season, Integer week) {
        List<EloService.Snapshot> matching = timeline.history().stream()
                .filter(s -> season == null || s.season() == season)
                .filter(s -> week == null || s.week() == week).toList();
        if (matching.isEmpty()) return List.of();
        EloService.Snapshot last = matching.getLast();
        return matching.stream().filter(s -> s.season() == last.season() && s.week() == last.week()).toList();
    }

    private double round(double value) {
        return Math.round(value * 10) / 10.0;
    }
}
