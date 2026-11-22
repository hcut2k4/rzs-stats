# Playoff suite: decisions made autonomously overnight (2026-11-22)

Each entry is a call made without the user. Review in the morning.

1. Branching: one branch per phase (`feature/playoffs-phaseN`), merged into LOCAL master only after Codex reviews are addressed. Nothing is pushed (Railway auto-deploys master on push).
2. Clinch markers: proven markers only (no "clinched unless a tie" second tier). Revisit after seeing how many markers are missing in weeks 14-16.
3. Clinch design: adopted the Opus architect's two-layer design (docs/playoffs-clinch-design.md). Layer 1 record math is sound alone; Layer 2 exhaustive search only near the end of the season, treating point-margin-dependent decisions as ambiguous.
4. Test data: Codex corrected backend/src/test/resources/playoffs/analysis/dataset.json (SIMFULL AFC seeds 1/2 were NE, DEN; now DEN, NE). Verified against sim-full-season.json maddenSeeds and docs/madden-playoff-tiebreakers.md ("screenshot re-audited 2026-11-21; an earlier transcription had NE #1").
5. Picture endpoint and real-NFL rules: Codex's first version returned 404 for the whole picture when the NFL rules could not resolve a tie (coin toss). Decision: show the tied teams in alphabetical order with a reason that the order is arbitrary instead of failing (fix applied in the Phase 1 review round).
6. Process: Codex jobs launched through the rescue subagent from several worktrees at once were silently lost, and worktrees outside the repo were read-only to the Codex sandbox. Worktrees now live in .worktrees/ (git-excluded) and jobs are launched with the plugin's companion `task` command from each worktree. Agents do not commit; the coordinator commits.
7. Phase 1 review findings accepted as known limitations (not fixed): the cache/sync concurrent-read race (same pattern as every other cached endpoint), "current season" ignoring a season whose schedule has no completed game yet (matches the other endpoints), and teams that appear in no imported game being dropped from the picture.
8. Codex usage limit: at 01:18 MST Codex reported its usage limit (resets 03:52 AM). Unfinished Codex jobs (leverage, ui3, clinch adversarial tests) were verified with plain test runs by the coordinator. Work that needs Codex implementation or Codex review waits for the reset; Claude reviewers cover the gap where useful.
