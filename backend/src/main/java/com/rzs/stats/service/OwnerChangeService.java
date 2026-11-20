package com.rzs.stats.service;

import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class OwnerChangeService {
    public List<EloService.OwnerChange> list() {
        return List.of(
                new EloService.OwnerChange(0, 10, 776601634, "MIN"),
                new EloService.OwnerChange(1, 0, 776601630, "SEA"),
                new EloService.OwnerChange(2, 0, 776601630, "SEA"),
                new EloService.OwnerChange(2, 0, 776601614, "DAL"));
    }
}
