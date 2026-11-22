# Testing

Backend tests in `backend/src/test/java/com/rzs/stats/`, run with `./mvnw test`:

| Area | Tests |
|------|-------|
| Stats | `StatsServiceTest`, `StatsControllerTest`, `StatsCacheTest` |
| Elo | `EloServiceTest`, `EloHistoryServiceTest`, `EloControllerTest`, `EloPersistenceTest` |
| QB | `QbStatsCalculatorTest`, `QbStatsServiceTest`, `QbStatsSyncServiceTest`, `QbControllerTest`, `QbStatsPersistenceTest` |
| Sync & admin | `SyncServiceTest`, `SyncSchedulerTest`, `AdminControllerTest`, `CacheWarmingServiceTest` |
| Auth | `AdminTokenTest`, `AdminTokenUnsetTest` — both the gated and the open case |
| Repository | `GameRepositoryTest` |

Service tests use Mockito for repositories. Key `StatsServiceTest` helpers:
- `team(id, name)` creates `TeamEntity`
- `game(id, home, away, homeScore, awayScore)` creates a completed game
- `futureGame(id, home, away)` creates an unplayed game

Persistence tests (`*PersistenceTest`) use a real DB rather than mocks — that's where unique constraints and upsert behavior get verified.

Every bug fix should have a regression test that verifies the exact invariant that was broken (e.g., `sosTotalBetweenPlayedAndLeft` for the SoS Total < min(Played, Left) bug).

Frontend tests in `frontend/src/test/` — Vitest + Testing Library. Run with `npm test -- --run`. Tests that render a page must wrap it in a `MemoryRouter`; pages are mocked at the `api/client` boundary with `vi.mock('../api/client')`.

Export specs are tested by mocking `../components/ExportMenu` with a stub that records its `spec` prop (see `exportStandings.test.js`), then asserting through `toRows`, `csvText`, `buildWorkbook` and `aiText`. That keeps the test on the data a user would export rather than on button clicks, and lets it check that `api.params` still matches the rows after out-of-order responses.

Playoff JSON fixtures use real backend responses and production Jackson configuration; plain `cd backend && ./mvnw test` compares them.
Regenerate with `cd backend && ./mvnw -Dtest=PlayoffFixturesTest -Dfixtures.update=true test`; review `frontend/src/test/fixtures/playoffs/*.json`.
Fixtures use fixed seeds, stable ordering, and normalized timestamps; `PlayoffComputeBenchmarkTest` (tag `benchmark`, enable with `-Dplayoffs.benchmark=true`) reports seeding counts.
