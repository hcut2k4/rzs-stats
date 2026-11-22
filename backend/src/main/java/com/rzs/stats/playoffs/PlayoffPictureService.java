package com.rzs.stats.playoffs;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.rzs.stats.service.EloService;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

@Service
public class PlayoffPictureService {
    public record Picture(int season, String rules, Integer throughWeek, Integer nextWeek,
                          int gamesPlayed, int gamesRemaining, List<Conference> conferences) {}
    public record Conference(String name, List<Row> seeds, List<Row> hunt) {}
    public record Row(@JsonInclude(JsonInclude.Include.NON_NULL) Integer seed,
                      @JsonInclude(JsonInclude.Include.NON_NULL) Integer rank,
                      EloService.Team team, String division, boolean divisionWinner,
                      int wins, int losses, int ties, Integer otherRulesSeed, List<String> reasons) {}

    private final SeasonStateLoader loader;

    public PlayoffPictureService(SeasonStateLoader loader) { this.loader = loader; }

    @Cacheable("playoffPicture")
    public Picture picture(Integer season, String rules) {
        if (!rules.equals("madden") && !rules.equals("nfl")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rules must be madden or nfl");
        }
        var state = loader.load(season);
        var madden = MaddenSeeding.madden27().seed(state.teams(), state.completedGames());
        var nfl = PlayoffSeeding.seedForPicture(state.teams(), state.completedGames());
        var result = rules.equals("madden") ? madden : nfl;
        var other = rules.equals("madden") ? nfl : madden;
        var otherSeeds = new HashMap<String, Integer>();
        other.conferences().values().stream().flatMap(Collection::stream)
                .filter(r -> r.position() <= 7 && r.teams().size() == 1)
                .forEach(r -> otherSeeds.put(r.teams().iterator().next(), r.position()));
        var reasons = new TiebreakExplainer().explain(result, state.identities());
        var teams = new HashMap<String, PlayoffSeeding.Team>();
        state.teams().forEach(t -> teams.put(t.abbr(), t));
        var conferences = new ArrayList<Conference>();
        result.conferences().forEach((name, ranks) -> {
            var seeds = new ArrayList<Row>();
            var hunt = new ArrayList<Row>();
            for (var rank : ranks) {
                var abbr = rank.teams().iterator().next();
                var record = result.records().get(abbr);
                int position = rank.position();
                var row = new Row(position <= 7 ? position : null, position > 7 ? position : null,
                        state.identities().get(abbr), teams.get(abbr).division(),
                        result.divisionRanks().get(abbr).position() == 1, record.wins(), record.losses(), record.ties(),
                        otherSeeds.get(abbr), reasons.getOrDefault(abbr, List.of()));
                (position <= 7 ? seeds : hunt).add(row);
            }
            conferences.add(new Conference(name, List.copyOf(seeds), List.copyOf(hunt)));
        });
        return new Picture(state.season(), rules, state.throughWeek(), state.nextWeek(), state.completedGames().size(),
                state.remainingGames().size(), List.copyOf(conferences));
    }
}
