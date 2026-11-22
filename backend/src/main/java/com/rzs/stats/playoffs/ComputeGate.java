package com.rzs.stats.playoffs;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import jakarta.annotation.PreDestroy;

import java.util.concurrent.*;
import java.util.function.Supplier;

@Component
public class ComputeGate implements AutoCloseable {
    private final Semaphore permits;
    private final long timeoutMillis, deadlineMillis;
    private final ThreadPoolExecutor executor;
    private final ThreadLocal<Long> deadline = new ThreadLocal<>();
    private final ThreadLocal<Boolean> worker = new ThreadLocal<>();
    private final ThreadLocal<Boolean> warming = new ThreadLocal<>();

    public ComputeGate(int capacity, long timeoutMillis) { this(capacity, timeoutMillis, 30000); }

    @Autowired
    public ComputeGate(@Value("${playoffs.max-concurrent-computations:2}") int capacity,
                       @Value("${playoffs.compute-timeout-ms:10000}") long timeoutMillis,
                       @Value("${playoffs.compute-deadline-ms:30000}") long deadlineMillis) {
        if (capacity < 1 || timeoutMillis < 0 || deadlineMillis < 1) throw new IllegalArgumentException("Invalid playoff compute limits");
        this.permits = new Semaphore(capacity, true);
        this.timeoutMillis = timeoutMillis;
        this.deadlineMillis = deadlineMillis;
        this.executor = new ThreadPoolExecutor(capacity, capacity, 0, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(capacity), runnable -> {
                    var thread = new Thread(runnable, "playoff-compute");
                    thread.setDaemon(true);
                    return thread;
                }, new ThreadPoolExecutor.AbortPolicy());
    }

    public <T> T compute(Supplier<T> body) {
        if (deadline.get() != null) { checkDeadline(); return body.get(); }
        try {
            if (Boolean.TRUE.equals(warming.get())) permits.acquire();
            else if (!permits.tryAcquire(timeoutMillis, TimeUnit.MILLISECONDS)) throw new BusyException();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusyException();
        }
        deadline.set(System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(deadlineMillis));
        try {
            T result = body.get();
            checkDeadline();
            return result;
        } finally {
            deadline.remove();
            permits.release();
        }
    }

    public <T> T execute(Supplier<T> body) {
        if (Boolean.TRUE.equals(worker.get())) { checkDeadline(); return body.get(); }
        return compute(() -> {
            long end = deadline.get();
            Future<T> future;
            try {
                future = executor.submit(() -> {
                    worker.set(true);
                    deadline.set(end);
                    try { checkDeadline(); return body.get(); }
                    finally { deadline.remove(); worker.remove(); }
                });
            } catch (RejectedExecutionException e) { throw new BusyException(); }
            try {
                return future.get(Math.max(1, end - System.nanoTime()), TimeUnit.NANOSECONDS);
            } catch (TimeoutException e) {
                future.cancel(true);
                throw new BusyException();
            } catch (InterruptedException e) {
                future.cancel(true);
                Thread.currentThread().interrupt();
                throw new BusyException();
            } catch (ExecutionException e) {
                if (e.getCause() instanceof RuntimeException failure) throw failure;
                if (e.getCause() instanceof Error failure) throw failure;
                throw new IllegalStateException(e.getCause());
            }
        });
    }

    public static void checkpoint() {
        if (Thread.currentThread().isInterrupted()) throw new BusyException();
    }

    private void checkDeadline() {
        checkpoint();
        if (deadline.get() != null && System.nanoTime() >= deadline.get()) throw new BusyException();
    }

    public void warm(Runnable body) {
        var previous = warming.get();
        warming.set(true);
        try { body.run(); }
        finally {
            if (previous == null) warming.remove(); else warming.set(previous);
        }
    }

    @PreDestroy
    public void close() { executor.shutdownNow(); }

    public static class BusyException extends RuntimeException {}
}
