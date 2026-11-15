package com.rzs.stats.model.ns;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class NsTeamStat {
    public String team__abbrName;
    public int offTotalPassYds;
    public int offTotalSacks;
    public int offTotalFumLost;
}
