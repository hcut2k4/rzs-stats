package com.rzs.stats.model.dto;

public class TeamDto {
    private Integer teamId;
    private String displayName;
    private String abbrName;
    private String cityName;
    private String conference;
    private String primaryColor;
    private Integer logoId;

    public TeamDto() {}

    public TeamDto(Integer teamId, String displayName, String abbrName,
                   String cityName, String conference, String primaryColor, Integer logoId) {
        this.teamId = teamId;
        this.displayName = displayName;
        this.abbrName = abbrName;
        this.cityName = cityName;
        this.conference = conference;
        this.primaryColor = primaryColor;
        this.logoId = logoId;
    }

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
    public String getPrimaryColor() { return primaryColor; }
    public void setPrimaryColor(String primaryColor) { this.primaryColor = primaryColor; }
    public Integer getLogoId() { return logoId; }
    public void setLogoId(Integer logoId) { this.logoId = logoId; }
}
