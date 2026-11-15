package com.rzs.stats.model.ns;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class NsRushingStat {
    public String player__rosterId;
    public String player__fullName;
    public String player__position;
    public String team__abbrName;
    public int rushTotalAtt;
    public int rushTotalYds;
    public int rushTotalTDs;
    public int rushTotalFum;
}
