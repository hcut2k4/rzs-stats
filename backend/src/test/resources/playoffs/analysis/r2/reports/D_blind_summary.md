# Codex D: blind rebuild (summary by coordinator)

Codex D (gpt-6.1-sol, xhigh) never saw M3, M4, the docs or the other workstreams. It built an NFL procedure, studied the mismatches and searched defect combinations for parsimony. It froze five candidates (`frozen_candidates.json`, sha256 dfda1c88…) before loading the partial 2026 season. Its first held-out run crashed: the division-rank map covered only the NFC North, so PHI had no entry. The coordinator re-ran the frozen code with that map completed. This is a recorded protocol deviation; model logic and frozen files are unchanged and the hashes were verified. D never wrote its own report.md.

| Candidate | Defects | Fit /34 | Partial 2026 /3 | Description |
|---|---:|---:|---:|---|
| D_bucket | 5 | 28 | **0** | Division two-club list for seeding and wild cards; multi H2H reversed with missing H2H = 0; no restart inside buckets |
| B_no_restart | 3 | 27 | 2 | Division list; reversed same-division reduction; no restart |
| A_minimal | 2 | 26 | 2 | Division list; reversed same-division reduction |
| C_reused_division | 1 | 23 | 3 | Division two-club list only |
| NFL_control | 0 | 19 | 2 | Official procedure |

Takeaways:
- Working blind, D converged on the same core as M3/M4: two-club ties reuse the division list, and multi-team or reduction H2H is reversed.
- D did not find the sweep-loser elimination. Its best in-sample model (D_bucket) then fails all three held-out groups; for example, it makes CHI the NFC North champion after CHI lost all four games to GB and DET.
- These are the only genuinely blind held-out scores in round 2. They support the elimination step shared by M3 and M4.

Files: scratchpad `r2/D_blind/` (procedure.py, buckets.py, frozen_candidates.json, eval_heldout_v2.py). The scratchpad is not preserved.
