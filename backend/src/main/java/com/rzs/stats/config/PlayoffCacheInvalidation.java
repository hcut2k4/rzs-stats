package com.rzs.stats.config;

import org.springframework.cache.CacheManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

public class PlayoffCacheInvalidation {
    private final CacheManager caches;
    private long generation;

    public synchronized long generation() { return generation; }

    public synchronized void publish(long expected, String cache, Object key, Object value) {
        if (generation == expected) caches.getCache(cache).put(key, value);
    }

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

    private synchronized void evict() {
        generation++;
        CacheNames.PLAYOFF.forEach(name -> caches.getCache(name).clear());
    }
}
