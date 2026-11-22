package com.rzs.stats.playoffs;

import org.junit.jupiter.api.Test;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;

import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.*;

class DietComputeTest {
    @Test
    void clinchSimulationsAndScenariosShareTheSameCpuCapacity() throws Exception {
        var state = ScenarioServiceTest.state(ClinchOracleTest.league(57, 3, true));
        var loader = new SeasonStateLoader(null) {
            @Override public State load(Integer season) { return state; }
        };
        try (var gate = new ComputeGate(2, 0); var callers = Executors.newVirtualThreadPerTaskExecutor()) {
            var started = new CountDownLatch(2);
            var finish = new CountDownLatch(1);
            var tasks = new ArrayList<Future<Boolean>>();
            for (int i = 0; i < 2; i++) tasks.add(callers.submit(() -> gate.execute(() -> {
                started.countDown();
                try { assertThat(finish.await(5, TimeUnit.SECONDS)).isTrue(); }
                catch (InterruptedException e) { throw new AssertionError(e); }
                return true;
            })));
            try {
                assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
                var clinch = new ClinchService(loader, 12, Duration.ofSeconds(20), gate);
                var scenarios = new ScenarioService(new ConcurrentMapCacheManager(), gate);
                var simulations = new SimulationService(gate);
                assertThatThrownBy(() -> clinch.clinch(state.season(), "madden")).isInstanceOf(ComputeGate.BusyException.class);
                assertThatThrownBy(() -> scenarios.scenarios(state, state.teams().getFirst().abbr(), "madden"))
                        .isInstanceOf(ComputeGate.BusyException.class);
                assertThatThrownBy(() -> simulations.simulate(state, SimulationServiceTest.probabilities(state),
                        Map.of(), 100, 42, SimulationService.Rules.MADDEN)).isInstanceOf(ComputeGate.BusyException.class);
            } finally { finish.countDown(); }
            for (var task : tasks) assertThat(task.get(5, TimeUnit.SECONDS)).isTrue();
        }
    }

    @Test
    void heavyAlgorithmsDoNotCreateThreadPoolsOrUseCommonPoolStreams() throws Exception {
        for (String name : List.of("ClinchAnalyzer", "ScenarioService", "SimulationService")) {
            String source = Files.readString(Path.of("src/main/java/com/rzs/stats/playoffs", name + ".java"));
            assertThat(source).doesNotContain("Executors.", ".parallel()", ".parallelStream()", "new ThreadPoolExecutor");
        }
    }
}
