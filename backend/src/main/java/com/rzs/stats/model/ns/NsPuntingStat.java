package com.rzs.stats.model.ns;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class NsPuntingStat {
    public String team__abbrName;
    public int puntTotalAtt;
}
