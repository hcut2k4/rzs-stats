package com.rzs.stats.model.entity;

import com.rzs.stats.model.dto.EloConfig;
import jakarta.persistence.*;

@Entity
@Table(name = "elo_config")
public class EloConfigEntity {
    @Id
    private Long id = 1L;
    private double initialRating = 1500;
    private double k = 25;
    private double divisor = 400;
    private boolean movEnabled = true;
    private int marginCap = 28;
    private double homeFieldAdvantage = 0;
    private double offseasonRetention = 0.78;

    public EloConfig config() {
        return new EloConfig(initialRating, k, divisor, movEnabled, marginCap, homeFieldAdvantage, offseasonRetention);
    }

    public void update(EloConfig config) {
        initialRating = config.initialRating();
        k = config.k();
        divisor = config.divisor();
        movEnabled = config.movEnabled();
        marginCap = config.marginCap();
        homeFieldAdvantage = config.homeFieldAdvantage();
        offseasonRetention = config.offseasonRetention();
    }
}
