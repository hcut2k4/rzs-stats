package com.rzs.stats.playoffs;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rzs.stats.config.CacheNames;
import com.rzs.stats.controller.PlayoffsController;
import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.repository.TeamRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.cache.CacheType;
import org.springframework.boot.test.autoconfigure.core.AutoConfigureCache;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@DataJpaTest(showSql = false)
@AutoConfigureCache(cacheProvider = CacheType.CAFFEINE)
@EnableCaching
@Import({SeasonStateLoader.class, PlayoffPictureService.class, ClinchService.class, PlayoffsController.class, CacheNames.class})
class PlayoffPictureTest {
    record Fixture(List<PlayoffSeeding.Team> teams, List<PlayoffSeeding.Game> games,
                   Map<String, List<String>> maddenSeeds) {}

    @Autowired GameRepository games;
    @Autowired TeamRepository teams;
    @Autowired SeasonStateLoader loader;
    @Autowired PlayoffsController controller;
    @Autowired CacheManager caches;
    private final ObjectMapper json = new ObjectMapper();
    private MockMvc http;
    private Map<String, Fixture> fixtures;

    @BeforeEach
    void setUp() throws Exception {
        caches.getCacheNames().forEach(name -> caches.getCache(name).clear());
        http = MockMvcBuilders.standaloneSetup(controller).build();
        try (var input = getClass().getResourceAsStream("/playoffs/rzs-seasons.json")) {
            fixtures = json.readValue(input, new TypeReference<>() {});
        }
    }

    @Test
    void historicalPicturesMatchMaddenFieldsAndUseZeroBasedSeasonIndices() throws Exception {
        for (var entry : fixtures.entrySet()) {
            int season = Integer.parseInt(entry.getKey()) - 103;
            seed(season, entry.getValue());
            var picture = picture("?season=" + season);
            assertThat(picture.get("season").asInt()).isEqualTo(season);
            assertThat(picture.get("rules").asText()).isEqualTo("madden");
            assertThat(picture.get("gamesPlayed").asInt()).isEqualTo(entry.getValue().games().size());
            assertThat(picture.get("gamesRemaining").asInt()).isZero();
            assertThat(picture.get("throughWeek").asInt()).isEqualTo(17);
            assertThat(picture.get("nextWeek").isNull()).isTrue();
            for (var conference : picture.get("conferences")) {
                assertThat(abbreviations(conference.get("seeds")))
                        .containsExactlyElementsOf(entry.getValue().maddenSeeds().get(conference.get("name").asText()));
                assertThat(conference.get("hunt").size()).isEqualTo(9);
                for (int i = 0; i < 7; i++) {
                    var row = conference.get("seeds").get(i);
                    assertThat(row.get("seed").asInt()).isEqualTo(i + 1);
                    assertThat(row.has("rank")).isFalse();
                    assertThat(row.get("divisionWinner").asBoolean()).isEqualTo(i < 4);
                    assertThat(row.get("team").get("teamId").isInt()).isTrue();
                    assertThat(row.get("team").get("displayName").asText()).isNotBlank();
                }
                for (int i = 0; i < 9; i++) {
                    assertThat(conference.get("hunt").get(i).get("rank").asInt()).isEqualTo(i + 8);
                    assertThat(conference.get("hunt").get(i).has("seed")).isFalse();
                }
            }
        }
        assertThat(picture("").get("season").asInt()).isEqualTo(1);
    }

    @Test
    void alternateSeedsExposeKnownNflDisagreementInBothDirections() throws Exception {
        seed(1, fixtures.get("104"));
        var madden = row(picture("?season=1"), "DET");
        var nfl = row(picture("?season=1&rules=nfl"), "DET");
        assertThat(madden.get("seed").asInt()).isEqualTo(7);
        assertThat(madden.get("otherRulesSeed").asInt()).isEqualTo(6);
        assertThat(nfl.get("seed").asInt()).isEqualTo(6);
        assertThat(nfl.get("otherRulesSeed").asInt()).isEqualTo(7);
        assertThat(row(picture("?season=1"), "PHI").get("otherRulesSeed").isNull()).isTrue();
        assertThat(row(picture("?season=1&rules=nfl"), "WAS").get("otherRulesSeed").isNull()).isTrue();
    }

    @Test
    void loaderSeparatesCompletedAndRemainingRegularGamesWithWeekBoundsAndIdentities() throws Exception {
        var entities = seed(0, fixtures.get("103"));
        games.deleteAllInBatch();
        save(1, 0, 1, 0, 3, entities.get("BUF"), entities.get("NYG"), 21, 21);
        save(2, 0, 1, 17, 1, entities.get("BUF"), entities.get("NYG"), null, null);
        save(3, 0, 1, 18, 2, entities.get("BUF"), entities.get("NYG"), 99, 0);
        save(4, 0, 0, 0, 2, entities.get("BUF"), entities.get("NYG"), 99, 0);
        save(5, 0, 1, -1, 2, entities.get("BUF"), entities.get("NYG"), 99, 0);
        save(6, 1, 1, 0, 1, entities.get("BUF"), entities.get("NYG"), null, null);
        var state = loader.load(null);
        assertThat(state.season()).isZero();
        assertThat(state.teams()).hasSize(2);
        assertThat(state.completedGames()).containsExactly(new PlayoffSeeding.Game(0, "BUF", "NYG", 21, 21));
        assertThat(state.remainingGames()).containsExactly(new SeasonStateLoader.RemainingGame(2, 17, "BUF", "NYG",
                entities.get("BUF").getTeamId(), entities.get("NYG").getTeamId()));
        assertThat(state.throughWeek()).isZero();
        assertThat(state.nextWeek()).isEqualTo(17);
        var response = picture("");
        assertThat(response.get("gamesPlayed").asInt()).isEqualTo(1);
        assertThat(response.get("gamesRemaining").asInt()).isEqualTo(1);
        assertThat(row(response, "BUF").get("ties").asInt()).isEqualTo(1);
        assertThat(row(response, "BUF").get("reasons").isEmpty()).isTrue();
    }

    @Test
    void unplayedSeasonHasNullThroughWeekAndAllTeamsAtZeroWins() throws Exception {
        var entities = seed(0, fixtures.get("103"));
        games.deleteAllInBatch();
        save(1, 0, 1, 0, 0, entities.get("BUF"), entities.get("NYG"), null, null);
        var response = picture("?season=0");
        assertThat(response.get("throughWeek").isNull()).isTrue();
        assertThat(response.get("nextWeek").asInt()).isZero();
        assertThat(row(response, "BUF").get("wins").asInt()).isZero();
    }

    @Test
    void unresolvedNflDivisionDoesNotInventSeeds() throws Exception {
        var entities = seed(0, fixtures.get("103"));
        games.deleteAllInBatch();
        save(1, 0, 1, 0, 0, entities.get("BUF"), entities.get("NE"), null, null);
        assertThat(row(picture("?season=0"), "BUF").get("otherRulesSeed").isNull()).isTrue();
        var response = http.perform(get("/api/playoffs/picture?season=0&rules=nfl"))
                .andExpect(status().isNotFound()).andReturn();
        assertThat(response.getResolvedException().getMessage()).contains("cannot resolve");
    }

    @Test
    void invalidRulesAndMissingSeasonsReturnContractStatuses() throws Exception {
        http.perform(get("/api/playoffs/picture?rules=unknown")).andExpect(status().isBadRequest());
        http.perform(get("/api/playoffs/picture?season=8")).andExpect(status().isNotFound());
        http.perform(get("/api/playoffs/picture")).andExpect(status().isNotFound());
    }

    @Test
    void missingConferenceOrDivisionRejectsWholePicture() throws Exception {
        var entities = seed(0, fixtures.get("103"));
        for (String field : List.of("conference", "division")) {
            var team = entities.get("BUF");
            team.setConference(field.equals("conference") ? null : "AFC");
            team.setDivision(field.equals("division") ? " " : "AFC East");
            teams.saveAndFlush(team);
            var response = http.perform(get("/api/playoffs/picture?season=0")).andExpect(status().isNotFound()).andReturn();
            assertThat(response.getResolvedException().getMessage()).contains("conference or division");
        }
    }

    @Test
    void pictureCacheKeepsResponseUntilSharedEviction() throws Exception {
        seed(0, fixtures.get("103"));
        var before = picture("?season=0");
        assertThat(caches.getCache("playoffPicture").getNativeCache()).isInstanceOf(com.github.benmanes.caffeine.cache.Cache.class);
        games.deleteAllInBatch();
        assertThat(picture("?season=0")).isEqualTo(before);
        new CacheNames().allStatsCaches(caches).resolveCaches(null).forEach(org.springframework.cache.Cache::clear);
        http.perform(get("/api/playoffs/picture?season=0")).andExpect(status().isNotFound());
    }

    @Test
    void clinchEndpointUsesRealSeasonAndSharedCaffeineEviction() throws Exception {
        seed(1, fixtures.get("104"));
        var response = http.perform(get("/api/playoffs/clinch?season=1")).andExpect(status().isOk())
                .andExpect(jsonPath("$.season").value(1)).andExpect(jsonPath("$.exhaustive").value(true))
                .andExpect(jsonPath("$.teams.length()").value(32)).andReturn().getResponse().getContentAsString();
        var rows = json.readTree(response).get("teams");
        for (var row : rows) {
            String abbr = row.get("team").get("abbrName").asText();
            boolean in = fixtures.get("104").maddenSeeds().values().stream().anyMatch(seeds -> seeds.contains(abbr));
            assertThat(row.get("playoffs").asText()).isEqualTo(in ? "clinched" : "eliminated");
        }
        http.perform(get("/api/playoffs/clinch?rules=nfl&season=1")).andExpect(status().isOk())
                .andExpect(jsonPath("$.exhaustive").value(false));
        http.perform(get("/api/playoffs/clinch?rules=unknown")).andExpect(status().isBadRequest());
        http.perform(get("/api/playoffs/clinch?season=99")).andExpect(status().isNotFound());
        assertThat(caches.getCache("playoffClinch").getNativeCache()).isInstanceOf(com.github.benmanes.caffeine.cache.Cache.class);
        games.deleteAllInBatch();
        http.perform(get("/api/playoffs/clinch?season=1")).andExpect(status().isOk()).andExpect(content().json(response));
        new CacheNames().allStatsCaches(caches).resolveCaches(null).forEach(org.springframework.cache.Cache::clear);
        http.perform(get("/api/playoffs/clinch?season=1")).andExpect(status().isNotFound());
    }

    private JsonNode picture(String query) throws Exception {
        return json.readTree(http.perform(get("/api/playoffs/picture" + query)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private List<String> abbreviations(JsonNode rows) {
        var result = new ArrayList<String>();
        rows.forEach(row -> result.add(row.get("team").get("abbrName").asText()));
        return result;
    }

    private JsonNode row(JsonNode picture, String abbr) {
        for (var conference : picture.get("conferences")) {
            for (String group : List.of("seeds", "hunt")) {
                for (var row : conference.get(group)) {
                    if (row.get("team").get("abbrName").asText().equals(abbr)) return row;
                }
            }
        }
        throw new AssertionError("Missing " + abbr);
    }

    private Map<String, TeamEntity> seed(int season, Fixture fixture) {
        var entities = new HashMap<String, TeamEntity>();
        teams.findAll().forEach(t -> entities.put(t.getAbbrName(), t));
        for (var source : fixture.teams()) {
            if (entities.containsKey(source.abbr())) continue;
            var team = new TeamEntity();
            team.setTeamId(entities.size() + 1);
            team.setAbbrName(source.abbr());
            team.setDisplayName(source.abbr() + " display");
            team.setConference(source.conference());
            team.setDivision(source.division());
            entities.put(source.abbr(), teams.save(team));
        }
        int id = 0;
        for (var game : fixture.games()) save(++id, season, 1, game.week(), 2, entities.get(game.home()), entities.get(game.away()), game.homeScore(), game.awayScore());
        games.flush();
        return entities;
    }

    private void save(int id, int season, int stage, int week, int status, TeamEntity home, TeamEntity away, Integer hs, Integer as) {
        var game = new GameEntity();
        game.setGameId(id);
        game.setSeasonIndex(season);
        game.setStageIndex(stage);
        game.setWeekIndex(week);
        game.setStatus(status);
        game.setHomeTeam(home);
        game.setAwayTeam(away);
        game.setHomeScore(hs);
        game.setAwayScore(as);
        games.saveAndFlush(game);
    }
}
