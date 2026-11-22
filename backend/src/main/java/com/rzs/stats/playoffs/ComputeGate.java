package com.rzs.stats.playoffs;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

@Component
public class ComputeGate {
    private final Semaphore permits;
    private final long timeoutMillis;
    private final ThreadLocal<Boolean> computing = new ThreadLocal<>();
    private final ThreadLocal<Boolean> warming = new ThreadLocal<>();

    public ComputeGate(@Value("${playoffs.max-concurrent-computations:2}") int capacity,
                       @Value("${playoffs.compute-timeout-ms:10000}") long timeoutMillis) {
        if (capacity < 1 || timeoutMillis < 0) throw new IllegalArgumentException("Invalid playoff compute limits");
        this.permits = new Semaphore(capacity, true);
        this.timeoutMillis = timeoutMillis;
    }

    public <T> T compute(Supplier<T> body) {
        // Nested work must not wait on its caller's permit.
        if (Boolean.TRUE.equals(computing.get())) return body.get();
        try {
            if (Boolean.TRUE.equals(warming.get())) permits.acquire();
            else if (!permits.tryAcquire(timeoutMillis, TimeUnit.MILLISECONDS)) throw new BusyException();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusyException();
        }
        computing.set(true);
        try {
            return body.get();
        } finally {
            computing.remove();
            permits.release();
        }
    }

    public void warm(Runnable body) {
        var previous = warming.get();
        warming.set(true);
        try {
            body.run();
        } finally {
            if (previous == null) warming.remove();
            else warming.set(previous);
        }
    }

    public static class BusyException extends RuntimeException {}
}
