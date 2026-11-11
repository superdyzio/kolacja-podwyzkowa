# Fable review — draw-neighbour (d66e78e)

Date: 2026-11-07. Reviewer: Fable subagent (local only, no GitHub comments). Verdict: no defect for the dinner; the
incremental cost proven exact (instrumented copy asserting `cost === totalCost()` after every iteration on 400 random
venues incl. kicks), `restoreBest()` / `repeats` / seats consistent, the placement restart sound, no false „lonely”
found by brute force, the new problem kind shown by the UI without changes.

| #   | Severity    | Finding                                                                                                 | Decision                                                                                                                                         |
| --- | ----------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | WARNING     | Hopeless „lonely” inputs (one guest, a pinned guest boxed in by pinned empty seats) spun the full 1.2 s | Fixed: static refusals before the search; the search is skipped when no move exists (everyone pinned); tests with a clock that throws if read |
| 2   | WARNING     | The placement restarts ran outside the time budget (worst ≈ 0.65 s on pathological inputs)              | Fixed: restarts stop at half the budget                                                                                                          |
| 3   | OBSERVATION | The restart regression test depends on seed 2226 exhausting the first search                           | Accepted; the test says how to find a new seed                                                                                                   |
| 4   | OBSERVATION | A „lonely” refusal names whoever is alone in the best arrangement, not a structural culprit             | Accepted: the advice in the message stays right                                                                                                  |
| 5   | OBSERVATION | Manual edits and restores can still leave someone alone without a warning                              | Accepted as documented; offered to the user as a follow-up                                                                                       |

Re-checked on the real venue after the fixes (read-only ids): 100/100 draws, 20 × 6 chained redraws and 20 000 draws
without a refusal, 0 repeats, none slower than 200 ms.
