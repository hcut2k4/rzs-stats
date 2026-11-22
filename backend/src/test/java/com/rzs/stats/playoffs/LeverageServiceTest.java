package com.rzs.stats.playoffs;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rzs.stats.config.CacheNames;
import com.rzs.stats.controller.PlayoffsLeverageController;
import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.repository.*;
import com.rzs.stats.service.*;
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
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@DataJpaTest(showSql = false, properties = "playoffs.leverage-simulations=100")
@AutoConfigureCache(cacheProvider = CacheType.CAFFEINE)
@EnableCaching
@Import({SeasonStateLoader.class, LeverageService.class, SimulationService.class,
        PlayoffsLeverageController.class, CacheNames.class, EloQueryService.class,
        EloHistoryService.class, EloService.class, EloConfigService.class, OwnerChangeService.class})
class LeverageServiceTest {
    @Autowired GameRepository games;
    @Autowired TeamRepository teams;
    @Autowired LeverageService leverage;
    @Autowired SeasonStateLoader loader;
    @Autowired EloQueryService elo;
    @Autowired PlayoffsLeverageController controller;
    @Autowired CacheManager caches;
    MockMvc http;
    final ObjectMapper json = new ObjectMapper();

    @BeforeEach
    void setup() {
        caches.getCacheNames().forEach(n -> caches.getCache(n).clear());
        http = MockMvcBuilders.standaloneSetup(controller).build();
    }

    void populate(boolean completed) throws Exception {
        var state = SimulationServiceTest.season(true);
        var entities = new HashMap<String, TeamEntity>();
        for (var t : state.teams()) {
            var team = new TeamEntity();
            team.setTeamId(entities.size() + 1);
            team.setAbbrName(t.abbr());
            team.setDisplayName(t.abbr());
            team.setDivision(t.division());
            team.setConference(t.conference());
            entities.put(t.abbr(), teams.save(team));
        }
        int id = 0;
        for (var g : state.completedGames()) {
            var game = new GameEntity();
            game.setSeasonIndex(2); game.setStageIndex(1); game.setWeekIndex(g.week()); game.setGameId(++id);
            game.setHomeTeam(entities.get(g.home())); game.setAwayTeam(entities.get(g.away()));
            game.setStatus(completed || g.week() < 16 ? 2 : 0);
            if (game.getStatus() == 2) { game.setHomeScore(g.homeScore()); game.setAwayScore(g.awayScore()); }
            games.save(game);
        }
        games.flush();
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"madden", "nfl"})
    void pairedMatrixConservesSpotsAndExposesMixturesImportanceAndRankedSwings(String rules) throws Exception {
        populate(false);
        var matrix = leverage.matrix(2, null, rules);
        var response = leverage.response(matrix);
        var state = loader.load(2);
        for (int i = 0; i < matrix.games().size(); i++) {
            var game = matrix.games().get(i);
            var exposed = response.games().get(i);
            assertThat(game.teams()).hasSize(32);
            for (int goal = 0; goal < 3; goal++) {
                var sums = new HashMap<String, Double>();
                double importance = 0;
                for (var team : state.teams()) {
                    var pair = game.teams().get(team.abbr());
                    double swing = value(pair.homeWin(), goal) - value(pair.awayWin(), goal);
                    sums.merge(goal == 1 ? team.division() : team.conference(), swing, Double::sum);
                    importance += Math.abs(swing) / 2;
                }
                sums.values().forEach(sum -> assertThat(sum).isCloseTo(0, within(1e-9)));
                assertThat(value(exposed.importance(), goal)).isCloseTo(importance, within(1e-12));
                for (var row : exposed.teams()) {
                    double win = value(row.ifWin(), goal), loss = value(row.ifLoss(), goal);
                    assertThat(value(row.current(), goal)).isBetween(Math.min(win, loss), Math.max(win, loss));
                    var pair = game.teams().get(row.team().abbrName());
                    assertThat(row.ifWin()).isEqualTo(row.side().equals("home") ? pair.homeWin() : pair.awayWin());
                    assertThat(value(row.current(), goal)).isEqualTo(game.homeWinProb() * value(pair.homeWin(), goal)
                            + (1 - game.homeWinProb()) * value(pair.awayWin(), goal));
                }
            }
            var ranked = game.teams().entrySet().stream()
                    .filter(e -> !e.getKey().equals(game.home().abbrName()) && !e.getKey().equals(game.away().abbrName()))
                    .sorted(Comparator.<Map.Entry<String, LeverageService.ConditionalOdds>>comparingDouble(e -> largestSwing(e.getValue()))
                            .reversed().thenComparing(Map.Entry::getKey)).limit(5).map(Map.Entry::getKey).toList();
            assertThat(exposed.others().stream().map(o -> o.team().abbrName()).toList()).isEqualTo(ranked);
            for (var other : exposed.others()) {
                int goal = List.of("playoffs", "division", "oneSeed").indexOf(other.goal());
                var pair = game.teams().get(other.team().abbrName());
                assertThat(other.swing()).isEqualTo(value(pair.homeWin(), goal) - value(pair.awayWin(), goal));
                assertThat(Math.abs(other.swing())).isEqualTo(largestSwing(pair));
            }
        }
        caches.getCache("leverage").clear();
        assertThat(leverage.matrix(2, null, rules).games()).isEqualTo(matrix.games());
        var body = json.readTree(http.perform(get("/api/playoffs/leverage?season=2&rules=" + rules))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(body.get("week").asInt()).isEqualTo(16);
        assertThat(body.get("simulations").asInt()).isEqualTo(100);
        assertThat(body.get("games").get(0).get("teams").size()).isEqualTo(2);
    }

    private double value(OddsService.Odds odds, int goal) {
        return goal == 0 ? odds.playoffs() : goal == 1 ? odds.division() : odds.oneSeed();
    }

    private double largestSwing(LeverageService.ConditionalOdds pair) {
        double largest = 0;
        for (int goal = 0; goal < 3; goal++) largest = Math.max(largest, Math.abs(value(pair.homeWin(), goal) - value(pair.awayWin(), goal)));
        return largest;
    }

    @Test
    void defaultAndExplicitWeekRequestsShareOneCachedMatrix() throws Exception {
        populate(false);
        var implicit = json.readTree(http.perform(get("/api/playoffs/leverage?season=2")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        var explicit = json.readTree(http.perform(get("/api/playoffs/leverage?season=2&week=" + implicit.get("week").asInt()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(explicit.get("computedAt").asText()).isEqualTo(implicit.get("computedAt").asText());
    }

    @Test
    void emptyWeeksAndCompletedSeasonsReturnEmptyGamesAndInvalidRequestsHaveContractStatuses() throws Exception {
        populate(true);
        http.perform(get("/api/playoffs/leverage?season=2&week=0")).andExpect(status().isOk()).andExpect(jsonPath("$.games").isEmpty());
        http.perform(get("/api/playoffs/leverage?season=2")).andExpect(status().isOk()).andExpect(jsonPath("$.games").isEmpty());
        http.perform(get("/api/playoffs/leverage?season=99")).andExpect(status().isNotFound());
        http.perform(get("/api/playoffs/leverage?rules=bad")).andExpect(status().isBadRequest());
        http.perform(get("/api/playoffs/leverage?season=2&week=99")).andExpect(status().isBadRequest());
        http.perform(get("/api/playoffs/leverage?season=2&week=-1")).andExpect(status().isBadRequest());
    }

    @Test
    void cacheIsRegisteredAndEvictedBySharedResolver() throws Exception {
        populate(false);
        var matrix = leverage.matrix(2, 16, "madden");
        games.deleteAllInBatch();
        assertThat(leverage.matrix(2, 16, "madden")).isSameAs(matrix);
        new CacheNames().allStatsCaches(caches).resolveCaches(null).forEach(org.springframework.cache.Cache::clear);
        http.perform(get("/api/playoffs/leverage?season=2&week=16")).andExpect(status().isNotFound());
    }

    @Test
    void headToHeadGameDecidesBothTeamsPlayoffAndDivisionChances() {
        var home = new TeamEntity();
        home.setTeamId(1); home.setAbbrName("BUF"); home.setDisplayName("Bills"); home.setConference("AFC"); home.setDivision("AFC East");
        var away = new TeamEntity();
        away.setTeamId(2); away.setAbbrName("NE"); away.setDisplayName("Patriots"); away.setConference("AFC"); away.setDivision("AFC East");
        teams.saveAllAndFlush(List.of(home, away));
        var contenders = List.of("PIT", "BAL", "HOU", "IND", "KC", "DEN");
        for (int i = 0; i < contenders.size(); i++) {
            var team = new TeamEntity();
            team.setTeamId(i + 3); team.setAbbrName(contenders.get(i)); team.setDisplayName(contenders.get(i));
            team.setConference("AFC"); team.setDivision(List.of("AFC North", "AFC South", "AFC West").get(i / 2));
            teams.saveAndFlush(team);
            for (var participant : List.of(home, away)) {
                var completed = new GameEntity();
                completed.setGameId(10 + i * 2 + participant.getTeamId()); completed.setSeasonIndex(2);
                completed.setStageIndex(1); completed.setWeekIndex(i); completed.setStatus(2);
                completed.setHomeTeam(team); completed.setAwayTeam(participant); completed.setHomeScore(30); completed.setAwayScore(10);
                games.saveAndFlush(completed);
            }
        }
        var game = new GameEntity();
        game.setGameId(1); game.setSeasonIndex(2); game.setStageIndex(1); game.setWeekIndex(17); game.setStatus(0);
        game.setHomeTeam(home); game.setAwayTeam(away); games.saveAndFlush(game);
        var result = leverage.response(leverage.matrix(2, null, "madden"));
        for (var row : result.games().getFirst().teams()) {
            assertThat(row.ifWin().playoffs()).isEqualTo(1);
            assertThat(row.ifLoss().playoffs()).isZero();
            assertThat(row.ifWin().division()).isEqualTo(1);
            assertThat(row.ifLoss().division()).isZero();
        }
    }

    @Test
    @org.junit.jupiter.api.Tag("benchmark")
    void reportsTimeForSixteenGameWeek() throws Exception {
        populate(false);
        var service = new LeverageService(loader, elo, new SimulationService(), 10000);
        long start = System.nanoTime();
        var result = service.matrix(2, 16, "madden");
        System.out.printf("BENCHMARK leverage 16-game week, 10,000 paired simulations: %.3f seconds%n", (System.nanoTime() - start) / 1e9);
        assertThat(result.games()).hasSize(16);
    }
}
