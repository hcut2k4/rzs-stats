package com.rzs.stats.client;

import com.rzs.stats.model.ns.NsGame;
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

    // stageIndex=1 covers both regular season (weekIndex 0-17) and playoffs (weekIndex >= 18).
    // We use size=500 to minimize pagination round-trips.
    public List<NsGame> fetchAllGamesForSeason(int seasonIndex) {
        String url = baseUrl + "/leagues/" + league + "/games/?seasonIndex=" + seasonIndex + "&stageIndex=1&size=500";
        return fetchAllPages(url, new ParameterizedTypeReference<NsPagedResponse<NsGame>>() {});
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
