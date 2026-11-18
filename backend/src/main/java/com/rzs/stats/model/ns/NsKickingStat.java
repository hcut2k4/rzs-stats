package com.rzs.stats.model.ns;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class NsKickingStat {
    public String team__abbrName;
    public int fGTotalAtt;
    public int fGTotalMade;
    public int xPTotalAtt;
    public int xPTotalMade;
}
