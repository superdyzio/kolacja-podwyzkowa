# Fable review — guess-place (48f54a5)

Date: 2026-11-06. Reviewer: Fable subagent (local only, no GitHub comments). Verdict: nothing critical; tie span,
place limit, keep-vs-clear semantics, the organizer upsert, the phone token, leak guardrails and the three
backward-compatibility paths (old server vs new schema, old phone JS vs new API, offline caches saved before the
change) verified.

| #   | Severity    | Finding                                                                                          | Decision                                                                                   |
| --- | ----------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 1   | WARNING     | `save_guest_guess_with_place` revoked from browser roles but never granted to `service_role`     | Fixed: explicit grant, as every other function migration (checked in the local catalog)    |
| 2   | OBSERVATION | A server-side place range error (limit changed since the last poll) showed under the amount      | Fixed: the guest route adds `field: "place"`, the phone shows it under the place and polls |
| 3   | OBSERVATION | README said an amount alone keeps the place — true only for old pages (the new one may clear it) | Fixed: README wording                                                                      |
| 4   | OBSERVATION | CLAUDE.md ranking contract still listed the DTOs without `predictedPlace` / `placeHit`           | Fixed                                                                                      |
| 5   | OBSERVATION | Phone token worst case is 62 of the 64-char route limit                                          | Accepted: realistic tokens ~45 chars; noted in CLAUDE.md for the next slice                |
| 6   | OBSERVATION | One extra head-only `count` per guest poll                                                       | Accepted: ≤ 100 rows, in parallel with the other reads                                     |
| 7   | OBSERVATION | `placeHitters` exported but the table filtered inline                                            | Fixed: the table uses `placeHitters(entries)`                                              |

Found while re-running the checks: three new integration tests assumed other guests in the local event (a fresh DB
has none, so place 2 was out of range); they now create the guests they need.
