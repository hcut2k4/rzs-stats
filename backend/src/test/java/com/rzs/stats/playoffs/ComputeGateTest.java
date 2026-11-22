package com.rzs.stats.playoffs;

import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ComputeGateTest {
    @Test
    void failedComputationReleasesItsPermit() {
        var gate = new ComputeGate(1, 0);
        assertThatThrownBy(() -> gate.execute(() -> { throw new IllegalArgumentException("failure"); }))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(gate.execute(() -> "next computation")).isEqualTo("next computation");
    }

    @RestController
    static class Controller {
        final ComputeGate gate;
        Controller(ComputeGate gate) { this.gate = gate; }
        @GetMapping("/compute")
        public String compute() { return gate.compute(() -> "done"); }
    }

    @Test
    void saturatedGateReturnsServiceUnavailableWithPlainMessage() throws Exception {
        var gate = new ComputeGate(1, 20);
        var started = new CountDownLatch(1);
        var finish = new CountDownLatch(1);
        var http = MockMvcBuilders.standaloneSetup(new Controller(gate))
                .setControllerAdvice(new WhatIfExceptionHandler()).build();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var running = executor.submit(() -> gate.compute(() -> {
                started.countDown();
                await(finish);
                return true;
            }));
            try {
                assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
                http.perform(get("/compute")).andExpect(status().isServiceUnavailable())
                        .andExpect(content().string("Playoff simulations are busy; try again shortly"));
            } finally {
                finish.countDown();
            }
            assertThat(running.get(5, TimeUnit.SECONDS)).isTrue();
        }
    }

    @Test
    void warmingWaitsPastThePublicTimeoutForAnAvailablePermit() throws Exception {
        var gate = new ComputeGate(1, 20);
        var started = new CountDownLatch(1);
        var finish = new CountDownLatch(1);
        var warming = new CountDownLatch(1);
        var computed = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var running = executor.submit(() -> gate.compute(() -> {
                started.countDown();
                await(finish);
                return true;
            }));
            try {
                assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
                var warm = executor.submit(() -> gate.warm(() -> {
                    warming.countDown();
                    gate.compute(() -> { computed.countDown(); return true; });
                }));
                assertThat(warming.await(5, TimeUnit.SECONDS)).isTrue();
                assertThat(computed.await(100, TimeUnit.MILLISECONDS)).isFalse();
                assertThat(warm.isDone()).isFalse();
                finish.countDown();
                warm.get(5, TimeUnit.SECONDS);
                assertThat(computed.getCount()).isZero();
                assertThat(running.get(5, TimeUnit.SECONDS)).isTrue();
            } finally {
                finish.countDown();
            }
        }
    }

    @Test
    void nestedComputationReusesTheThreadsPermit() {
        var gate = new ComputeGate(1, 0);
        assertThat(gate.compute(() -> gate.compute(() -> "nested"))).isEqualTo("nested");
    }

    @RestController
    static class SlowController {
        private final ComputeGate gate;
        SlowController(ComputeGate gate) { this.gate = gate; }
        @GetMapping("/slow")
        public String slow() {
            return gate.execute(() -> {
                try { Thread.sleep(5000); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                ComputeGate.checkpoint();
                return "late";
            });
        }
    }

    @Test
    void deadlineReturns503WithRetryAfterAndReleasesCapacity() throws Exception {
        try (var gate = new ComputeGate(1, 20, 50)) {
            var http = MockMvcBuilders.standaloneSetup(new SlowController(gate))
                    .setControllerAdvice(new WhatIfExceptionHandler()).build();
            http.perform(get("/slow")).andExpect(status().isServiceUnavailable())
                    .andExpect(header().string("Retry-After", "5"));
            assertThat(gate.execute(() -> "next")).isEqualTo("next");
        }
    }

    @Test
    void allHeavyWorkSharesTheSameBoundedWorkers() throws Exception {
        try (var gate = new ComputeGate(2, 10000, 5000);
             var callers = Executors.newVirtualThreadPerTaskExecutor()) {
            var active = new java.util.concurrent.atomic.AtomicInteger();
            var maximum = new java.util.concurrent.atomic.AtomicInteger();
            var workers = java.util.concurrent.ConcurrentHashMap.<Long>newKeySet();
            var futures = new java.util.ArrayList<java.util.concurrent.Future<Integer>>();
            for (int i = 0; i < 12; i++) futures.add(callers.submit(() -> gate.execute(() -> {
                workers.add(Thread.currentThread().threadId());
                maximum.accumulateAndGet(active.incrementAndGet(), Math::max);
                try {
                    try { Thread.sleep(10); } catch (InterruptedException e) { throw new AssertionError(e); }
                    return gate.execute(() -> 1);
                } finally { active.decrementAndGet(); }
            })));
            for (var future : futures) assertThat(future.get()).isEqualTo(1);
            assertThat(maximum.get()).isEqualTo(2);
            assertThat(workers).hasSize(2);
        }
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) throw new AssertionError("Computation did not finish");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AssertionError(e);
        }
    }
}
