package com.rzs.stats.repository;

import com.rzs.stats.model.entity.QbGameStatEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.TeamGameStatEntity;
import com.rzs.stats.client.NeonSportzClient;
import com.rzs.stats.service.QbStatsSyncService;
import com.sun.net.httpserver.HttpServer;
import org.springframework.test.util.ReflectionTestUtils;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import com.rzs.stats.service.QbStatsWeekWriter;
import com.rzs.stats.service.QbStatsService;
import com.rzs.stats.service.QbStatsCalculator;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@Import({QbStatsWeekWriter.class, QbStatsService.class, QbStatsCalculator.class})
class QbStatsPersistenceTest {
    @Autowired QbGameStatRepository repository;
    @Autowired TeamRepository teams;
    @Autowired QbStatsWeekWriter writer;
    @Autowired QbStatsService stats;
    @Autowired GameRepository games;
    @Autowired TeamGameStatRepository teamStats;

    private QbGameStatEntity row(int week, int yards) {
        TeamEntity team = teams.findByTeamId(1).orElseGet(() -> {
            var t = new TeamEntity();
            t.setTeamId(1);
            t.setAbbrName("AAA");
            return teams.save(t);
        });
        var row = new QbGameStatEntity();
        row.setRosterId("123");
        row.setPlayerName("Quarterback");
        row.setTeam(team);
        row.setSeasonIndex(0);
        row.setStageIndex(1);
        row.setWeekIndex(week);
        row.setPassYds(yards);
        return row;
    }

    @Test
    void weeklyRanksHaveNoMovementWhileSeasonRanksRetainMovement() {
        var a0 = row(0, 400);
        var b0 = row(0, 200);
        var a1 = row(1, 0);
        var b1 = row(1, 600);
        a0.setRosterId("a");
        a1.setRosterId("a");
        b0.setRosterId("b");
        b1.setRosterId("b");
        for (var stat : List.of(a0, b0, a1, b1)) stat.setPassAtt(20);
        repository.saveAllAndFlush(List.of(a0, b0, a1, b1));

        var weekly = stats.leaderboard(QbStatsService.Scope.WEEK, 0, 1, QbStatsService.Stage.REGULAR, null, true);
        assertThat(weekly).extracting(d -> d.rosterId).containsExactly("b", "a");
        assertThat(weekly).extracting(d -> d.rank).containsExactly(1, 2);
        assertThat(weekly).allSatisfy(d -> assertThat(d.rankChange).isNull());
        var season = stats.leaderboard(QbStatsService.Scope.SEASON, 0, 1, QbStatsService.Stage.REGULAR, null, false);
        assertThat(season).extracting(d -> d.rosterId).containsExactly("b", "a");
        assertThat(season).extracting(d -> d.rankChange).containsExactly(1, -1);
    }

    @Test
    void replacingWeekUpdatesUniquePlayerGameAndPreservesOtherWeeks() {
        writer.replaceWeek(0, 1, 0, List.of(row(0, 100)), List.of());
        writer.replaceWeek(0, 1, 1, List.of(row(1, 200)), List.of());
        writer.replaceWeek(0, 1, 0, List.of(row(0, 300)), List.of());
        repository.flush();
        assertThat(repository.findInScope(0, 0, 17)).extracting(QbGameStatEntity::getPassYds).containsExactly(300, 200);
        assertThat(repository.existsBySeasonIndexAndStageIndexAndWeekIndex(0, 1, 0)).isTrue();
    }

    @Test
    void incrementalSyncRefetchesPartlyStoredOlderWeekThenSkipsItOnceAllCompletedTeamsAreStored() throws Exception {
        var qb = row(0, 100);
        var home = qb.getTeam();
        var away = new TeamEntity();
        away.setTeamId(2);
        away.setAbbrName("BBB");
        teams.saveAndFlush(away);
        for (int week = 0; week <= 2; week++) {
            var game = new GameEntity();
            game.setGameId(week);
            game.setSeasonIndex(0);
            game.setStageIndex(1);
            game.setWeekIndex(week);
            game.setStatus(2);
            game.setHomeTeam(home);
            game.setAwayTeam(away);
            games.save(game);
        }
        games.flush();
        writer.replaceWeek(0, 1, 0, List.of(qb), List.of(teamRow(home, 0)));
        writer.replaceWeek(0, 1, 1, List.of(row(1, 200)), List.of(teamRow(home, 1), teamRow(away, 1)));
        teamStats.flush();
        assertThat(teamStats.countBySeasonIndexAndStageIndexAndWeekIndex(0, 1, 0)).isEqualTo(1);
        var requests = new ArrayList<String>();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/leagues/TEST/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            requests.add(exchange.getRequestURI().toString());
            String response = switch (path) {
                case "/leagues/TEST/" -> "{\"season\":0}";
                case "/leagues/TEST/stats/passing/" -> """
                        {"results":[{"player__rosterId":"123","player__fullName":"Quarterback",
                        "player__position":"QB","team__abbrName":"AAA","passTotalYds":300}],"next":null}
                        """;
                case "/leagues/TEST/stats/teams/" -> """
                        {"results":[{"team__abbrName":"AAA","offTotalPassYds":300},
                        {"team__abbrName":"BBB"}],"next":null}
                        """;
                default -> "{\"results\":[],\"next\":null}";
            };
            byte[] body = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (var output = exchange.getResponseBody()) {
                output.write(body);
            }
        });
        server.start();
        try {
            var client = new NeonSportzClient();
            ReflectionTestUtils.setField(client, "baseUrl", "http://127.0.0.1:" + server.getAddress().getPort());
            ReflectionTestUtils.setField(client, "league", "TEST");
            var sync = new QbStatsSyncService(client, games, teams, repository, teamStats, writer);
            sync.syncIncremental(0, java.util.Set.of());
            assertThat(sync.getStatus().success()).isTrue();
            assertThat(sync.getStatus().message()).isEqualTo("2 QB weeks synced");
            assertThat(teamStats.countBySeasonIndexAndStageIndexAndWeekIndex(0, 1, 0)).isEqualTo(2);
            assertThat(repository.findInScope(0, 0, 0)).extracting(QbGameStatEntity::getPassYds).containsExactly(300);
            assertThat(requests).anyMatch(r -> r.contains("weekIndex=0"));
            assertThat(requests).noneMatch(r -> r.contains("weekIndex=1"));
            requests.clear();
            sync.syncIncremental(0, java.util.Set.of());
            assertThat(sync.getStatus().success()).isTrue();
            assertThat(sync.getStatus().message()).isEqualTo("0 QB weeks synced");
            assertThat(requests).noneMatch(r -> r.contains("weekIndex=0") || r.contains("weekIndex=1"));
            assertThat(requests).isEmpty();
        } finally {
            server.stop(0);
        }
    }

    private TeamGameStatEntity teamRow(TeamEntity team, int week) {
        var row = new TeamGameStatEntity();
        row.setTeam(team);
        row.setSeasonIndex(0);
        row.setStageIndex(1);
        row.setWeekIndex(week);
        return row;
    }

    @Test
    void scopeQueriesSeparatePlayoffsAndExcludePreseason() {
        var preseason = row(0, 50);
        preseason.setStageIndex(0);
        repository.saveAll(List.of(preseason, row(17, 100), row(18, 200), row(22, 300)));
        repository.flush();
        assertThat(repository.findInScope(null, 0, 17)).extracting(QbGameStatEntity::getPassYds).containsExactly(100);
        assertThat(repository.findInScope(null, 18, 22)).extracting(QbGameStatEntity::getPassYds).containsExactly(200, 300);
    }
}
