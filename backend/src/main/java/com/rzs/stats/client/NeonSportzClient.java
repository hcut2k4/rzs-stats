package com.rzs.stats.client;

import com.rzs.stats.model.ns.NsGame;
import com.rzs.stats.model.ns.NsKickingStat;
import com.rzs.stats.model.ns.NsPassingStat;
import com.rzs.stats.model.ns.NsPuntingStat;
import com.rzs.stats.model.ns.NsRushingStat;
import com.rzs.stats.model.ns.NsTeamStat;
import com.rzs.stats.model.ns.NsLeague;
import com.rzs.stats.model.ns.NsPagedResponse;
import com.rzs.stats.model.ns.NsTeam;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class NeonSportzClient {

    private static final int MAX_THROTTLE_ATTEMPTS = 6;
    private static final long DEFAULT_THROTTLE_SECONDS = 5;
    private static final long MAX_THROTTLE_SECONDS = 60;
    private static final Pattern EXPECTED_SECONDS = Pattern.compile("available in (\\d+) second");

    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${rzs.neonsportz.base-url}")
    private String baseUrl;

    @Value("${rzs.neonsportz.league}")
    private String league;

    public NsLeague fetchLeagueInfo() {
        String url = baseUrl + "/leagues/" + league + "/";
        return restTemplate.getForObject(url, NsLeague.class);
    }

    public List<NsTeam> fetchAllTeams() {
        String url = baseUrl + "/leagues/" + league + "/teams/";
        return fetchAllPages(url, new ParameterizedTypeReference<NsPagedResponse<NsTeam>>() {});
    }

    // Fetch all games for a season regardless of stageIndex; each game's stageIndex is stored
    // from the API response. We use size=500 to minimize pagination round-trips.
    public List<NsGame> fetchAllGamesForSeason(int seasonIndex) {
        String url = baseUrl + "/leagues/" + league + "/games/?seasonIndex=" + seasonIndex + "&size=500";
        return fetchAllPages(url, new ParameterizedTypeReference<NsPagedResponse<NsGame>>() {});
    }

    public List<NsPassingStat> fetchPassingStats(int season, int stage, int week) {
        return fetchWeekStats("passing", season, stage, week, new ParameterizedTypeReference<NsPagedResponse<NsPassingStat>>() {});
    }

    public List<NsRushingStat> fetchRushingStats(int season, int stage, int week) {
        return fetchWeekStats("rushing", season, stage, week, new ParameterizedTypeReference<NsPagedResponse<NsRushingStat>>() {});
    }

    public List<NsKickingStat> fetchKickingStats(int season, int stage, int week) {
        return fetchWeekStats("kicking", season, stage, week, new ParameterizedTypeReference<NsPagedResponse<NsKickingStat>>() {});
    }

    public List<NsPuntingStat> fetchPuntingStats(int season, int stage, int week) {
        return fetchWeekStats("punting", season, stage, week, new ParameterizedTypeReference<NsPagedResponse<NsPuntingStat>>() {});
    }

    public List<NsTeamStat> fetchTeamsStats(int season, int stage, int week) {
        return fetchWeekStats("teams", season, stage, week, new ParameterizedTypeReference<NsPagedResponse<NsTeamStat>>() {});
    }

    private <T> List<T> fetchWeekStats(String kind, int season, int stage, int week, ParameterizedTypeReference<NsPagedResponse<T>> typeRef) {
        if (stage != 1 || week < 0 || week > 22) throw new IllegalArgumentException("Weekly stats require stage 1, weeks 0-22");
        String url = baseUrl + "/leagues/" + league + "/stats/" + kind + "/?size=100&seasonIndex=" + season
                + "&stageIndex=" + stage + "&weekIndex=" + week;
        return fetchAllPages(url, typeRef);
    }

    private <T> List<T> fetchAllPages(String url, ParameterizedTypeReference<NsPagedResponse<T>> typeRef) {
        List<T> all = new ArrayList<>();
        String nextUrl = url;
        while (nextUrl != null) {
            NsPagedResponse<T> page = getPage(nextUrl, typeRef);
            if (page == null) break;
            all.addAll(page.getResults());
            nextUrl = page.getNext();
        }
        return all;
    }

    // A full stat sync is a few hundred back-to-back requests and NeonSportz throttles with 429; waiting out
    // the stated delay lets the sync finish instead of aborting and rerunning every week.
    private <T> NsPagedResponse<T> getPage(String url, ParameterizedTypeReference<NsPagedResponse<T>> typeRef) {
        for (int attempt = 1; ; attempt++) {
            try {
                return restTemplate.exchange(url, HttpMethod.GET, null, typeRef).getBody();
            } catch (HttpClientErrorException.TooManyRequests e) {
                if (attempt >= MAX_THROTTLE_ATTEMPTS) throw e;
                try {
                    Thread.sleep(throttleDelayMillis(e));
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw e;
                }
            }
        }
    }

    static long throttleDelayMillis(HttpClientErrorException e) {
        return Math.min(Math.max(retryAfterSeconds(e), 0), MAX_THROTTLE_SECONDS) * 1000 + 1000;
    }

    private static long retryAfterSeconds(HttpClientErrorException e) {
        String header = e.getResponseHeaders() == null ? null : e.getResponseHeaders().getFirst("Retry-After");
        if (header != null) {
            try {
                return Long.parseLong(header.trim());
            } catch (NumberFormatException ignored) {
            }
            try {
                return Duration.between(Instant.now(), ZonedDateTime.parse(header.trim(), DateTimeFormatter.RFC_1123_DATE_TIME).toInstant()).getSeconds();
            } catch (DateTimeParseException ignored) {
            }
        }
        Matcher m = EXPECTED_SECONDS.matcher(e.getResponseBodyAsString());
        if (m.find()) {
            try {
                return Long.parseLong(m.group(1));
            } catch (NumberFormatException ignored) {
            }
        }
        return DEFAULT_THROTTLE_SECONDS;
    }
}
