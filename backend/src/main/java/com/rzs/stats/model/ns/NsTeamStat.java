package com.rzs.stats.model.ns;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class NsTeamStat {
    public String team__abbrName;
    public int offTotalPassYds;
    public Integer offTotalRushYds;
    public int offTotalSacks;
    public int offTotalFumLost;
    public int offTotalIntsLost;
    public int offTotalTotalYds;
    public int offTotal1stDowns;
    public int offTotalPassTDs;
    public int offTotalRushTDs;
    public int offTotal3rdDownAtt;
    public int offTotal3rdDownConv;
    public int offTotal4thDownAtt;
    public int offTotal4thDownConv;
    public int offTotalRedZones;
    public int offTotalRedZoneTDs;
    public int offTotal2PtAtt;
    public int offTotal2PtConv;
}
