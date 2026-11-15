package com.rzs.stats.model.dto;

public record EloConfig(double initialRating, double k, double divisor, boolean movEnabled,
                        int marginCap, double homeFieldAdvantage, double offseasonRetention) {
    public static EloConfig defaults() {
        return new EloConfig(1500, 25, 400, true, 21, 0, 0.90);
    }

    public boolean valid() {
        return Double.isFinite(initialRating) && initialRating > 0
                && Double.isFinite(k) && k >= 1 && k <= 100
                && Double.isFinite(divisor) && divisor > 0 && marginCap >= 1
                && Double.isFinite(homeFieldAdvantage)
                && Double.isFinite(offseasonRetention) && offseasonRetention >= 0 && offseasonRetention <= 1;
    }
}
