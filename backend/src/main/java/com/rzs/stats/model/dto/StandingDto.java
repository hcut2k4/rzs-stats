package com.rzs.stats.model.dto;

public class StandingDto {
    private Integer teamId;
    private String displayName;
    private String abbrName;
    private String cityName;
    private String conference;
    private String division;
    private String primaryColor;
    private Integer logoId;

    private int wins;
    private int losses;
    private int ties;
    private int gamesPlayed;
    private int pointsFor;
    private int pointsAgainst;
    private double winPct;

    private double pythagoreanPat;
    private double winDiff;            // actual wins minus PyPAT-expected wins (luck)
    private double oppPyPatCurr;       // SoS Played: avg opponent PyPAT, current season
    private double oppPyPatPrev;       // SoS Played: avg opponent PyPAT, previous season
    private Double oppPyPatRemainingCurr; // SoS Left: future opponents' current season PyPAT (null if none)
    private Double oppPyPatRemainingPrev; // SoS Left: future opponents' previous season PyPAT (null if none)
    private Double oppPyPatTotalCurr;     // SoS Total: all scheduled opponents, current season stats (null if no schedule)
    private Double oppPyPatTotalPrev;     // SoS Total: all scheduled opponents, previous season stats (null if no schedule)

    public Integer getTeamId() { return teamId; }
    public void setTeamId(Integer teamId) { this.teamId = teamId; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public String getAbbrName() { return abbrName; }
    public void setAbbrName(String abbrName) { this.abbrName = abbrName; }
    public String getCityName() { return cityName; }
    public void setCityName(String cityName) { this.cityName = cityName; }
    public String getConference() { return conference; }
    public void setConference(String conference) { this.conference = conference; }
    public String getDivision() { return division; }
    public void setDivision(String division) { this.division = division; }
    public String getPrimaryColor() { return primaryColor; }
    public void setPrimaryColor(String primaryColor) { this.primaryColor = primaryColor; }
    public Integer getLogoId() { return logoId; }
    public void setLogoId(Integer logoId) { this.logoId = logoId; }
    public int getWins() { return wins; }
    public void setWins(int wins) { this.wins = wins; }
    public int getLosses() { return losses; }
    public void setLosses(int losses) { this.losses = losses; }
    public int getTies() { return ties; }
    public void setTies(int ties) { this.ties = ties; }
    public int getGamesPlayed() { return gamesPlayed; }
    public void setGamesPlayed(int gamesPlayed) { this.gamesPlayed = gamesPlayed; }
    public int getPointsFor() { return pointsFor; }
    public void setPointsFor(int pointsFor) { this.pointsFor = pointsFor; }
    public int getPointsAgainst() { return pointsAgainst; }
    public void setPointsAgainst(int pointsAgainst) { this.pointsAgainst = pointsAgainst; }
    public double getWinPct() { return winPct; }
    public void setWinPct(double winPct) { this.winPct = winPct; }
    public double getPythagoreanPat() { return pythagoreanPat; }
    public void setPythagoreanPat(double pythagoreanPat) { this.pythagoreanPat = pythagoreanPat; }
    public double getWinDiff() { return winDiff; }
    public void setWinDiff(double winDiff) { this.winDiff = winDiff; }
    public double getOppPyPatCurr() { return oppPyPatCurr; }
    public void setOppPyPatCurr(double oppPyPatCurr) { this.oppPyPatCurr = oppPyPatCurr; }
    public double getOppPyPatPrev() { return oppPyPatPrev; }
    public void setOppPyPatPrev(double oppPyPatPrev) { this.oppPyPatPrev = oppPyPatPrev; }
    public Double getOppPyPatRemainingCurr() { return oppPyPatRemainingCurr; }
    public void setOppPyPatRemainingCurr(Double oppPyPatRemainingCurr) { this.oppPyPatRemainingCurr = oppPyPatRemainingCurr; }
    public Double getOppPyPatRemainingPrev() { return oppPyPatRemainingPrev; }
    public void setOppPyPatRemainingPrev(Double oppPyPatRemainingPrev) { this.oppPyPatRemainingPrev = oppPyPatRemainingPrev; }
    public Double getOppPyPatTotalCurr() { return oppPyPatTotalCurr; }
    public void setOppPyPatTotalCurr(Double oppPyPatTotalCurr) { this.oppPyPatTotalCurr = oppPyPatTotalCurr; }
    public Double getOppPyPatTotalPrev() { return oppPyPatTotalPrev; }
    public void setOppPyPatTotalPrev(Double oppPyPatTotalPrev) { this.oppPyPatTotalPrev = oppPyPatTotalPrev; }
}
