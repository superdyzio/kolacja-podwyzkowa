# Fable review — restaurant-orders (d92ec17, b474123)

Date: 2026-11-03. Reviewer: Fable subagent (local only, no GitHub comments). Verdict: no critical defects; access
control, data isolation (no prices/ids/keys/absences on `/r/`), the polling fingerprint and the migration (additive;
reset functions differ from `20261030120000_reset_event.sql` only by the `orders` part) verified.

| #   | Severity    | Finding                                                                                         | Decision                                                                                     |
| --- | ----------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | WARNING     | A price prefilled from a known dish stayed when the name was typed on to a new dish             | Fixed: an untouched price follows the dish and empties when there is no match                |
| 2   | WARNING     | A quick second click on „Wydane” re-sent the first value (controlled box waited for the answer) | Fixed: the box shows the latest tick at once; the server value returns after the last answer |
| 3   | OBSERVATION | An edit could not change only the capitalisation of the line's own dish                         | Fixed: `findDish` is skipped when the dish key is unchanged                                  |
| 4   | OBSERVATION | Between `db push` and the deploy the old code rejects `reset_counts` (strict schema)            | Accepted: deploy right after `db push` (README)                                              |
| 5   | OBSERVATION | 32-bit FNV fingerprint could collide                                                            | Accepted: ~2⁻³² per change, length included, next change recovers                            |
| 6   | OBSERVATION | The 400-line cap is count-then-insert                                                           | Accepted: same pattern as guests/rooms                                                       |
| 7   | OBSERVATION | `checkedAt` unused in `useRestaurantView`                                                       | Fixed: removed                                                                               |
