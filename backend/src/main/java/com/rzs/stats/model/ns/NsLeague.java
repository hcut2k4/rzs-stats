package com.rzs.stats.model.ns;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public class NsLeague {
    private String name;
    private Integer season;
    private Integer week;

    @JsonProperty("calendar_year")
    private Integer calendarYear;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public Integer getSeason() { return season; }
    public void setSeason(Integer season) { this.season = season; }
    public Integer getWeek() { return week; }
    public void setWeek(Integer week) { this.week = week; }
    public Integer getCalendarYear() { return calendarYear; }
    public void setCalendarYear(Integer calendarYear) { this.calendarYear = calendarYear; }
}
