package com.rzs.stats.playoffs;

import java.util.List;

public record MaddenSeeding() {
    public static MaddenSeeding m3() {
        return new MaddenSeeding();
    }

    public PlayoffSeeding.Result seed(List<PlayoffSeeding.Team> teams, List<PlayoffSeeding.Game> games) {
        return PlayoffSeeding.seedMadden(teams, games);
    }
}
