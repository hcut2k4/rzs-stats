package com.rzs.stats.client;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.Arguments;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;
import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.test.util.ReflectionTestUtils;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NeonSportzClientTest {
    @Test
    void kickingStatsRetryOnceAfterThrottlingAndReturnTheResponseRows() throws Exception {
        var requests = new AtomicInteger();
        var server = server(requests, false);
        try {
            var rows = client(server).fetchKickingStats(2, 1, 3);
            assertThat(rows).singleElement().satisfies(r -> {
                assertThat(r.team__abbrName).isEqualTo("AAA");
                assertThat(r.fGTotalAtt).isEqualTo(3);
                assertThat(r.fGTotalMade).isEqualTo(2);
            });
            assertThat(requests.get()).isEqualTo(2);
        } finally {
            server.stop(0);
        }
    }

    @Test
    void persistentThrottlingThrowsAfterExactlySixRequests() throws Exception {
        var requests = new AtomicInteger();
        var server = server(requests, true);
        try {
            assertThatThrownBy(() -> client(server).fetchKickingStats(2, 1, 3))
                    .isInstanceOf(HttpClientErrorException.TooManyRequests.class);
            assertThat(requests.get()).isEqualTo(6);
        } finally {
            server.stop(0);
        }
    }

    private HttpServer server(AtomicInteger requests, boolean alwaysThrottle) throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/leagues/TEST/stats/kicking/", exchange -> {
            int request = requests.incrementAndGet();
            boolean throttled = alwaysThrottle || request == 1;
            String body = throttled ? "{\"detail\":\"Throttled\"}"
                    : "{\"count\":1,\"next\":null,\"previous\":null,\"results\":["
                    + "{\"team__abbrName\":\"AAA\",\"fGTotalAtt\":3,\"fGTotalMade\":2}]}";
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            if (throttled) exchange.getResponseHeaders().set("Retry-After", "0");
            exchange.sendResponseHeaders(throttled ? 429 : 200, bytes.length);
            try (var output = exchange.getResponseBody()) {
                output.write(bytes);
            } finally {
                exchange.close();
            }
        });
        server.start();
        return server;
    }

    private NeonSportzClient client(HttpServer server) {
        var client = new NeonSportzClient();
        ReflectionTestUtils.setField(client, "baseUrl", "http://127.0.0.1:" + server.getAddress().getPort());
        ReflectionTestUtils.setField(client, "league", "TEST");
        return client;
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("throttleResponses")
    void throttleDelayUsesServerAdviceWithBoundsAndASafetySecond(
            String behavior, String header, String body, long expectedMillis) {
        var headers = new HttpHeaders();
        if (header != null) headers.set("Retry-After", header);
        var error = HttpClientErrorException.create(HttpStatus.TOO_MANY_REQUESTS, "Throttled",
                headers, body.getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8);

        assertThat(NeonSportzClient.throttleDelayMillis(error)).isEqualTo(expectedMillis);
    }

    @Test
    void throttleDelayHonorsAnHttpDateRetryAfter() {
        var headers = new HttpHeaders();
        headers.set("Retry-After", java.time.format.DateTimeFormatter.RFC_1123_DATE_TIME
                .format(java.time.ZonedDateTime.now(java.time.ZoneOffset.UTC).plusSeconds(30)));
        var error = HttpClientErrorException.create(HttpStatus.TOO_MANY_REQUESTS, "Throttled",
                headers, new byte[0], StandardCharsets.UTF_8);

        assertThat(NeonSportzClient.throttleDelayMillis(error)).isBetween(29000L, 31000L);
    }

    @Test
    void throttleDelayForAnHttpDateInThePastIsTheSafetySecondOnly() {
        var headers = new HttpHeaders();
        headers.set("Retry-After", java.time.format.DateTimeFormatter.RFC_1123_DATE_TIME
                .format(java.time.ZonedDateTime.now(java.time.ZoneOffset.UTC).minusMinutes(5)));
        var error = HttpClientErrorException.create(HttpStatus.TOO_MANY_REQUESTS, "Throttled",
                headers, new byte[0], StandardCharsets.UTF_8);

        assertThat(NeonSportzClient.throttleDelayMillis(error)).isEqualTo(1000L);
    }

    static Stream<Arguments> throttleResponses() {
        String body = "{\"detail\":\"Request was throttled. Expected available in 4 seconds.\"}";
        return Stream.of(
                Arguments.of("header wins over body", "2", body, 3000L),
                Arguments.of("body supplies seconds", null, body, 5000L),
                Arguments.of("missing advice uses default", null, "{}", 6000L),
                Arguments.of("huge delay is capped", "999999", "", 61000L),
                Arguments.of("negative delay is clamped", "-4", "", 1000L),
                Arguments.of("garbage header falls back to the body", "garbage", body, 5000L),
                Arguments.of("garbage header without a body uses default", "garbage", "", 6000L));
    }

    @ParameterizedTest
    @CsvSource({"0,0", "2,0", "-1,0", "1,23", "1,-1"})
    void weeklyStatRequestsRejectUnsupportedStagesAndWeeksBeforeHttp(int stage, int week) {
        var client = new NeonSportzClient();
        ReflectionTestUtils.setField(client, "baseUrl", "http://127.0.0.1:1");
        ReflectionTestUtils.setField(client, "league", "TEST");
        assertThatThrownBy(() -> client.fetchPassingStats(0, stage, week)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> client.fetchKickingStats(0, stage, week)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> client.fetchPuntingStats(0, stage, week)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> client.fetchTeamsStats(0, stage, week)).isInstanceOf(IllegalArgumentException.class);
    }
}
