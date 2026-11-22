package com.rzs.stats.model.entity;

import com.rzs.stats.playoffs.OddsService;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Entity
@Table(name = "playoff_odds_snapshots", uniqueConstraints = @UniqueConstraint(columnNames = {"season", "next_week", "team_id"}))
public class OddsSnapshotEntity {
    public static final String MODEL_VERSION = "madden27-counter-v1";
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private int season;
    @Column(name = "next_week", nullable = false)
    private int nextWeek;
    @Column(name = "team_id", nullable = false)
    private int teamId;
    private double playoffs;
    private double division;
    private double oneSeed;
    @Column(length = 512, nullable = false)
    private String seedOdds;
    private int simulations;
    @Column(nullable = false)
    private String rules = "madden";
    private Instant computedAt;
    private String modelVersion;
    private String eloConfigHash;
    private String inputFingerprint;
    private String origin;

    public void provenance(String configHash, String fingerprint, String modelVersion, String origin) {
        this.modelVersion = modelVersion;
        this.eloConfigHash = configHash;
        this.inputFingerprint = fingerprint;
        this.origin = origin;
    }

    public String getModelVersion() { return modelVersion; }
    public String getEloConfigHash() { return eloConfigHash; }
    public String getInputFingerprint() { return inputFingerprint; }
    public String getOrigin() { return origin; }


    protected OddsSnapshotEntity() {}

    public OddsSnapshotEntity(OddsService.Response response, OddsService.Row row) {
        season = response.season();
        nextWeek = response.nextWeek() == null ? -1 : response.nextWeek();
        teamId = row.team().teamId();
        playoffs = row.odds().playoffs();
        division = row.odds().division();
        oneSeed = row.odds().oneSeed();
        seedOdds = row.seedOdds().stream().map(String::valueOf).collect(Collectors.joining(","));
        simulations = response.simulations();
        computedAt = response.computedAt();
    }

    public int getSeason() { return season; }
    public int getNextWeek() { return nextWeek; }
    public int getTeamId() { return teamId; }
    public double getPlayoffs() { return playoffs; }
    public double getDivision() { return division; }
    public double getOneSeed() { return oneSeed; }
    public List<Double> getSeedOdds() { return Arrays.stream(seedOdds.split(",")).map(Double::valueOf).toList(); }
    public int getSimulations() { return simulations; }
    public String getRules() { return rules; }
    public Instant getComputedAt() { return computedAt; }
}
