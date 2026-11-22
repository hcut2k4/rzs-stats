package com.rzs.stats.playoffs;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rzs.stats.config.CacheNames;
import com.rzs.stats.controller.PlayoffsPathController;
import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.repository.TeamRepository;
import com.rzs.stats.service.*;
import org.junit.jupiter.api.*;
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

@DataJpaTest(showSql = false, properties = {"playoffs.simulations=200", "playoffs.path-simulations=200",
        "playoffs.path-risk-simulations=40", "playoffs.leverage-simulations=100"})
@AutoConfigureCache(cacheProvider = CacheType.CAFFEINE)
@EnableCaching
@Import({SeasonStateLoader.class, PathService.class, PlayoffsPathController.class, OddsService.class,
        ClinchService.class, LeverageService.class, SimulationService.class, CacheNames.class, EloQueryService.class,
        EloHistoryService.class, EloService.class, EloConfigService.class, OwnerChangeService.class})
class PathServiceTest {
    @Autowired GameRepository games;
    @Autowired TeamRepository teams;
    @Autowired PathService paths;
    @Autowired PlayoffsPathController controller;
    @Autowired OddsService odds;
    @Autowired ClinchService clinch;
    @Autowired LeverageService leverage;
    @Autowired SeasonStateLoader loader;
    @Autowired SimulationService simulator;
    @Autowired EloQueryService elo;
    @Autowired CacheNames names;
    @Autowired CacheManager caches;
    MockMvc http;
    record Fixture(List<PlayoffSeeding.Team> teams, List<PlayoffSeeding.Game> games) {}

    @BeforeEach
    void setup() {
        caches.getCacheNames().forEach(n -> caches.getCache(n).clear());
        http = MockMvcBuilders.standaloneSetup(controller).build();
    }

    private void populate(List<PlayoffSeeding.Team> league, List<PlayoffSeeding.Game> schedule, Set<Integer> remaining) {
        var entities = new HashMap<String, TeamEntity>();
        for (var t : league) {
            var e = new TeamEntity(); e.setTeamId(entities.size() + 1); e.setAbbrName(t.abbr()); e.setDisplayName(t.abbr());
            e.setConference(t.conference()); e.setDivision(t.division()); entities.put(t.abbr(), teams.save(e));
        }
        for (int i = 0; i < schedule.size(); i++) {
            var g = schedule.get(i); var e = new GameEntity();
            e.setGameId(i + 1); e.setSeasonIndex(1); e.setStageIndex(1); e.setWeekIndex(g.week());
            e.setHomeTeam(entities.get(g.home())); e.setAwayTeam(entities.get(g.away())); e.setStatus(remaining.contains(i) ? 0 : 2);
            if (!remaining.contains(i)) { e.setHomeScore(g.homeScore()); e.setAwayScore(g.awayScore()); }
            games.save(e);
        }
        games.flush();
    }

    private void race() {
        var schedule = new ArrayList<PlayoffSeeding.Game>();
        for (int w = 0; w < 17; w++) schedule.add(new PlayoffSeeding.Game(w, w == 16 ? "B" : "A", w == 16 ? "A" : "B", w < 8 ? 7 : 0, w < 8 ? 0 : 7));
        populate(List.of(new PlayoffSeeding.Team("A", "AFC", "East"), new PlayoffSeeding.Team("B", "AFC", "East")), schedule, Set.of(15, 16));
    }

    @Test
    void winningOutRaisesPlayoffOddsInAnEightTeamConferenceRace() {
        var league = ClinchOracleTest.league(1, 0, true).teams();
        var schedule = new ArrayList<PlayoffSeeding.Game>();
        var remaining = new HashSet<Integer>();
        for (int w = 0; w < 17; w++) for (int t = 0; t < 8; t++) {
            int wins = t == 0 ? 7 : t == 1 ? 8 : 10;
            if (t == 0 && w >= 15) remaining.add(schedule.size());
            String home = league.get(t).abbr(), away = league.get(t + 8).abbr();
            if (w == 16) { String swap = home; home = away; away = swap; }
            boolean homeWins = (w < wins) != (w == 16);
            schedule.add(new PlayoffSeeding.Game(w, home, away, homeWins ? 7 : 0, homeWins ? 0 : 7));
        }
        populate(league, schedule, remaining);
        var response = paths.path(1, "T00", "madden");
        assertThat(response.current().playoffs()).isStrictlyBetween(0.0, 1.0);
        assertThat(response.winOut().playoffs()).isEqualTo(1);
        assertThat(response.winOut().controlsDestiny()).isTrue();
        double previous = -1;
        for (var row : response.winsNeeded()) {
            assertThat(row.playoffs()).isGreaterThanOrEqualTo(previous); previous = row.playoffs();
        }
    }

    private Fixture historical() throws Exception {
        var mapper = new ObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        try (var in = getClass().getResourceAsStream("/playoffs/rzs-seasons.json")) {
            return mapper.<Map<String, Fixture>>readValue(in, new TypeReference<>() {}).get("104");
        }
    }

    @Test
    void winOutIsProvenAndFinalWinBucketsMatchTheBaselineInASimpleRace() throws Exception {
        race();
        var response = paths.path(1, "A", "madden");
        var base = odds.odds(1, "madden").conferences().getFirst().teams().stream().filter(r -> r.team().abbrName().equals("A")).findFirst().orElseThrow();
        assertThat(response.current()).isEqualTo(base.odds());
        assertThat(response.ceiling().seedOdds()).isEqualTo(base.seedOdds());
        assertThat(response.winOut().playoffs()).isGreaterThanOrEqualTo(response.current().playoffs());
        assertThat(response.winOut().division()).isGreaterThan(response.current().division());
        assertThat(response.winOut().controlsDestiny()).isTrue();
        assertThat(response.winsNeeded().stream().mapToDouble(PathService.WinsNeeded::chance).sum()).isCloseTo(1, within(.005));
        double playoffs = -1, division = -1, one = -1;
        for (var row : response.winsNeeded()) {
            assertThat(row.playoffs()).isGreaterThanOrEqualTo(playoffs); playoffs = row.playoffs();
            assertThat(row.division()).isGreaterThanOrEqualTo(division); division = row.division();
            assertThat(row.oneSeed()).isGreaterThanOrEqualTo(one); one = row.oneSeed();
        }
        assertThat(response.remainingGames()).isEqualTo(2);
        assertThat(response.scenarios()).isNotNull();
        assertThat(paths.path(1, "A", "madden")).isSameAs(response);
        assertThat(paths.path(1, "A", "madden").scenarios()).isSameAs(response.scenarios());
        assertThat(names.allStatsCaches(caches).resolveCaches(null)).extracting(c -> c.getName()).contains("playoffPath");
        http.perform(get("/api/playoffs/path/A?season=1")).andExpect(status().isOk()).andExpect(jsonPath("winOut.controlsDestiny").value(true))
                .andExpect(jsonPath("simulations").value(200))
                .andExpect(jsonPath("scenarios.remainingGames").value(2))
                .andExpect(jsonPath("scenarios.assumes").value("No tie games; point-differential tiebreaks are treated as unknown"))
                .andExpect(jsonPath("scenarios.goals.division.status").value("open"))
                .andExpect(jsonPath("scenarios.goals.division.clinchedBy[0].text").value("A beat B"))
                .andExpect(jsonPath("scenarios.goals.division.clinchedBy[0].conditions[0].gameId").isNumber())
                .andExpect(jsonPath("scenarios.goals.division.clinchedBy[0].conditions[0].winner").value("A"))
                .andExpect(jsonPath("scenarios.goals.oneSeed.eliminatedBy").isArray())
                .andExpect(jsonPath("scenarios.goals.playoffs.status").isString());
    }

    @Test
    void publicEndpointRejectsUnknownTeamsSeasonsAndRules() throws Exception {
        race();
        http.perform(get("/api/playoffs/path/ZZZ?season=1")).andExpect(status().isNotFound());
        http.perform(get("/api/playoffs/path/A?season=99")).andExpect(status().isNotFound());
        http.perform(get("/api/playoffs/path/A?season=1&rules=bad")).andExpect(status().isBadRequest());
        http.perform(get("/api/playoffs/path/A?season=1&rules=nfl")).andExpect(status().isOk());
    }

    @Test
    void rootingUsesTheFullMatrixAndRanksOtherGamesByAbsolutePlayoffSwing() throws Exception {
        var f = historical(); var remaining = new HashSet<Integer>();
        for (int i = 0; i < f.games().size(); i++) if (f.games().get(i).week() >= 16) remaining.add(i);
        populate(f.teams(), f.games(), remaining);
        var response = paths.path(1, "WAS", "madden");
        var matrix = leverage.matrix(1, 16, "madden");
        var expected = matrix.games().stream().filter(g -> !g.home().abbrName().equals("WAS") && !g.away().abbrName().equals("WAS"))
                .filter(g -> Math.abs(g.teams().get("WAS").homeWin().playoffs() - g.teams().get("WAS").awayWin().playoffs()) >= .02)
                .sorted(Comparator.comparingDouble((LeverageService.GameMatrix g) -> Math.abs(g.teams().get("WAS").homeWin().playoffs()
                        - g.teams().get("WAS").awayWin().playoffs())).reversed().thenComparingInt(LeverageService.GameMatrix::gameId))
                .limit(5).map(LeverageService.GameMatrix::gameId).toList();
        assertThat(expected).isNotEmpty();
        assertThat(response.rootThisWeek()).extracting(PathService.RootGame::gameId).containsExactlyElementsOf(expected);
        assertThat(response.rootThisWeek()).allSatisfy(g -> {
            assertThat(List.of(g.home().abbrName(), g.away().abbrName())).doesNotContain("WAS");
            assertThat(g.rootFor()).isEqualTo(g.swing() > 0 ? "home" : "away");
        });
        assertThat(response.winOutRisks()).hasSizeLessThanOrEqualTo(5).allSatisfy(g -> {
            assertThat(List.of(g.home().abbrName(), g.away().abbrName())).doesNotContain("WAS");
            assertThat(Math.abs(g.swing())).isGreaterThanOrEqualTo(.02);
        });
    }

    @Test
    void aMaddenWinThatStillMissesDoesNotControlDestiny() throws Exception {
        var f = historical();
        int index = java.util.stream.IntStream.range(0, f.games().size()).filter(i -> {
            var g = f.games().get(i); return Set.of(g.home(), g.away()).equals(Set.of("WAS", "PHI"));
        }).findFirst().orElseThrow();
        populate(f.teams(), f.games(), Set.of(index));
        var response = paths.path(1, "WAS", "madden");
        assertThat(response.winOut().controlsDestiny()).isFalse();
        assertThat(response.winOut().playoffs()).isLessThan(1);
    }

    @Test
    void completedSeasonKeepsExactOddsAndNoFutureGames() throws Exception {
        var f = historical(); populate(f.teams(), f.games(), Set.of());
        var response = paths.path(1, "WAS", "madden");
        assertThat(response.scenarios()).isNull();
        assertThat(response.simulations()).isZero();
        assertThat(response.remainingGames()).isZero();
        assertThat(response.current().playoffs()).isZero();
        assertThat(response.ceiling().bestSeed()).isNull();
        assertThat(response.winOut().controlsDestiny()).isFalse();
        assertThat(response.rootThisWeek()).isEmpty();
        assertThat(response.winOutRisks()).isEmpty();
        assertThat(response.winsNeeded()).hasSize(1);
        assertThat(response.winsNeeded().getFirst().chance()).isEqualTo(1);
    }

    @Test
    @Tag("benchmark")
    void reportsPathRuntimeAtTwentyThousandBaselineSimulations() throws Exception {
        var f = historical();
        var remaining = new HashSet<Integer>();
        int own = java.util.stream.IntStream.range(0, f.games().size()).filter(i -> {
            var g = f.games().get(i); return g.week() == 17 && (g.home().equals("WAS") || g.away().equals("WAS"));
        }).findFirst().orElseThrow();
        remaining.add(own);
        for (int i = 0; i < f.games().size() && remaining.size() < 3; i++) if (f.games().get(i).week() == 17) remaining.add(i);
        populate(f.teams(), f.games(), remaining);
        var baseline = new OddsService(loader, elo, simulator, 20000, caches);
        var service = new PathService(loader, baseline, clinch, leverage, simulator, elo, 5000, 2000);
        long start = System.nanoTime();
        var response = service.path(1, "WAS", "madden");
        assertThat(response.simulations()).isEqualTo(20000);
        System.out.printf("Path benchmark: 32 teams, 20,000 baseline + 20,000 tracked + 5,000 win-out + paired risks, %.3f seconds%n", (System.nanoTime() - start) / 1e9);
    }
}
