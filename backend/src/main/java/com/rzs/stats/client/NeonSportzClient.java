package com.rzs.stats.client;

import com.rzs.stats.model.ns.NsGame;
import com.rzs.stats.model.ns.NsPassingStat;
import com.rzs.stats.model.ns.NsRushingStat;
import com.rzs.stats.model.ns.NsTeamStat;
import com.rzs.stats.model.ns.NsLeague;
import com.rzs.stats.model.ns.NsPagedResponse;
import com.rzs.stats.model.ns.NsTeam;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.List;

@Component
public class NeonSportzClient {

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
        if (stage != 1 || week < 0 || week > 22) throw new IllegalArgumentException("QB stats require stage 1, weeks 0-22");
        String url = baseUrl + "/leagues/" + league + "/stats/passing/?size=100&seasonIndex=" + season
                + "&stageIndex=" + stage + "&weekIndex=" + week;
        return fetchAllPages(url, new ParameterizedTypeReference<NsPagedResponse<NsPassingStat>>() {});
    }

    public List<NsRushingStat> fetchRushingStats(int season, int stage, int week) {
        if (stage != 1 || week < 0 || week > 22) throw new IllegalArgumentException("QB stats require stage 1, weeks 0-22");
        String url = baseUrl + "/leagues/" + league + "/stats/rushing/?size=100&seasonIndex=" + season
                + "&stageIndex=" + stage + "&weekIndex=" + week;
        return fetchAllPages(url, new ParameterizedTypeReference<NsPagedResponse<NsRushingStat>>() {});
    }

    public List<NsTeamStat> fetchTeamsStats(int season, int stage, int week) {
        if (stage != 1 || week < 0 || week > 22) throw new IllegalArgumentException("QB stats require stage 1, weeks 0-22");
        String url = baseUrl + "/leagues/" + league + "/stats/teams/?size=100&seasonIndex=" + season
                + "&stageIndex=" + stage + "&weekIndex=" + week;
        return fetchAllPages(url, new ParameterizedTypeReference<NsPagedResponse<NsTeamStat>>() {});
    }

    private <T> List<T> fetchAllPages(String url, ParameterizedTypeReference<NsPagedResponse<T>> typeRef) {
        List<T> all = new ArrayList<>();
        String nextUrl = url;
        while (nextUrl != null) {
            NsPagedResponse<T> page = restTemplate.exchange(nextUrl, HttpMethod.GET, null, typeRef).getBody();
            if (page == null) break;
            all.addAll(page.getResults());
            nextUrl = page.getNext();
        }
        return all;
    }
}
