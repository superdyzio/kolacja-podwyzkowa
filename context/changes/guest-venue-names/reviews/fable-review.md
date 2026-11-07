# Fable review — guest-venue-names (31b73c5, f000840)

Date: 2026-11-07. Reviewer: Fable subagent (local only, no GitHub comments). Verdict: no critical findings; privacy
(live API and page HTML checked for ids, keys, absences, other guests' keys), the seats query and mapping (identical
to the TV), the 204/200 token parity and the shared `VenueDrawing` for the TV, editor, restaurant and order pages
verified.

| #   | Severity    | Finding                                                                                                 | Decision                                                                                                                                                 |
| --- | ----------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | WARNING     | The whole-venue map was drawn at 16:9 first and not re-centred when the plan photo's real aspect arrived | Fixed: the map waits for the aspect („Wczytuję plan sali…”; a photo that fails counts as 16:9); the hidden photo stays mounted, so hide/show reads it once |
| 2   | OBSERVATION | A republish that only moves the guest's table did not re-centre                                         | Fixed: the re-centre key includes the own table's position, rotation and the aspect                                                                     |
| 3   | OBSERVATION | Every published name now travels in the island props of the guest page (~+15 KB at 100 guests)          | Accepted                                                                                                                                                 |
| 4   | OBSERVATION | One full `npm run lint` run flaked on an untouched file (typed-lint resolution)                        | Noted; re-runs clean                                                                                                                                     |

Checked after the fix: headless phone with a 4:3 plan and a guest at a table in the lower right — loading text, then
the table in view; hide/show → one image request; no page errors.
