package com.rzs.stats.model.ns;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class NsPassingStat {
    public String player__rosterId;
    public String player__fullName;
    public String player__position;
    public String team__abbrName;
    public String passerAvgRating;
    public int passTotalAtt;
    public int passTotalComp;
    public int passTotalYds;
    public int passTotalTDs;
    public int passTotalInts;
    public int passTotalSacks;
}
