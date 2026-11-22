package com.rzs.stats.playoffs;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class MaddenSeedingFixtureTest {
    record Season(String id, List<PlayoffSeeding.Team> teams, List<PlayoffSeeding.Game> games, JsonNode expected) {}

    static List<Season> seasons() throws IOException {
        var result = new ArrayList<Season>();
        for (var entry : new ObjectMapper().readTree(Path.of("src/test/resources/playoffs/madden27-fixture.json").toFile())) {
            var teams = new ArrayList<PlayoffSeeding.Team>();
            var games = new ArrayList<PlayoffSeeding.Game>();
            for (var t : entry.get("teams")) teams.add(new PlayoffSeeding.Team(t.get(0).asText(), t.get(1).asText(), t.get(2).asText()));
            for (var g : entry.get("games")) games.add(new PlayoffSeeding.Game(g.get(0).asInt(), g.get(1).asText(), g.get(2).asText(), g.get(3).asInt(), g.get(4).asInt()));
            result.add(new Season(entry.get("id").asText(), teams, games, entry.get("expected")));
        }
        return result;
    }

    @Test
    void matchesEveryPythonDivisionWinnerAndPlayoffSeed() throws IOException {
        int conferences = 0;
        for (var season : seasons()) {
            var result = MaddenSeeding.madden27().seed(season.teams(), season.games());
            var fields = season.expected().fields();
            while (fields.hasNext()) {
                var entry = fields.next();
                String label = season.id() + " " + entry.getKey();
                var expected = new ArrayList<String>();
                entry.getValue().get("seeds").forEach(t -> expected.add(t.asText()));
                var ranks = result.conferences().get(entry.getKey());
                assertEquals(expected, ranks.stream().limit(7).map(r -> r.teams().iterator().next()).toList(), label);
                var winners = entry.getValue().get("divisionWinners").fields();
                while (winners.hasNext()) {
                    var winner = winners.next();
                    assertEquals(1, result.divisionRanks().get(winner.getValue().asText()).position(), label + " " + winner.getKey());
                }
                assertEquals(16, ranks.size(), label);
                conferences++;
            }
        }
        assertTrue(conferences >= 300);
        System.out.println("Python Madden27 fixture: " + conferences + "/" + conferences + " conference-seasons match");
    }
}
