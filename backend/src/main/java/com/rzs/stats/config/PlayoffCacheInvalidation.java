package com.rzs.stats.config;

import org.springframework.cache.CacheManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.concurrent.atomic.AtomicBoolean;

public class PlayoffCacheInvalidation {
    private final CacheManager caches;
    private final AtomicBoolean warm = new AtomicBoolean();

    public PlayoffCacheInvalidation(CacheManager caches) { this.caches = caches; }

    public void changed() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { evict(); }
            });
        } else evict();
    }

    public void failed() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCompletion(int status) { evict(); }
            });
        } else evict();
    }

    private void evict() {
        CacheNames.PLAYOFF.forEach(name -> caches.getCache(name).clear());
        warm.set(true);
    }

    public boolean takeWarm() { return warm.getAndSet(false); }
}
