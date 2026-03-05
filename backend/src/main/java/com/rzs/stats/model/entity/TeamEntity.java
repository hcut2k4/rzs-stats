package com.rzs.stats.model.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "team")
public class TeamEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "team_id", nullable = false, unique = true)
    private Integer teamId;

    @Column(name = "ns_id", unique = true)
    private Integer nsId;

    private String displayName;
    private String nickname;
    private String cityName;
    private String abbrName;
    private String conference;
    private String division;
    private String primaryColor;
    private Integer logoId;

    public Long getId() { return id; }
    public Integer getTeamId() { return teamId; }
    public Integer getNsId() { return nsId; }
    public void setNsId(Integer nsId) { this.nsId = nsId; }
    public void setTeamId(Integer teamId) { this.teamId = teamId; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public String getNickname() { return nickname; }
    public void setNickname(String nickname) { this.nickname = nickname; }
    public String getCityName() { return cityName; }
    public void setCityName(String cityName) { this.cityName = cityName; }
    public String getAbbrName() { return abbrName; }
    public void setAbbrName(String abbrName) { this.abbrName = abbrName; }
    public String getConference() { return conference; }
    public void setConference(String conference) { this.conference = conference; }
    public String getDivision() { return division; }
    public void setDivision(String division) { this.division = division; }
    public String getPrimaryColor() { return primaryColor; }
    public void setPrimaryColor(String primaryColor) { this.primaryColor = primaryColor; }
    public Integer getLogoId() { return logoId; }
    public void setLogoId(Integer logoId) { this.logoId = logoId; }
}
