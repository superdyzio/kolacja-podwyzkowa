# Fable review — guest-delivered (fa17162)

Date: 2026-11-07. Reviewer: Fable subagent (local only, no GitHub comments). Verdict: nothing critical; the access
model (scope A enforced in the DB on read and write), the locking and the quantity trigger, the grants, the token
parity, the 0-/1-based piece mapping and the i18n verified; `npm test`, lint and `astro check` green.

| #   | Severity    | Finding                                                                                                  | Decision                                                                                                                                  |
| --- | ----------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | WARNING     | `guest_order_lines` called `guest_published_table_id()` per order line (×2) on every guest poll          | Fixed in the not yet pushed migration: a scalar sub-select (InitPlan, once per call); `explain` shows the InitPlan and both index scans |
| 2   | OBSERVATION | `order_item.delivered` drifts for anything the old code writes between `db push` and the deploy          | Accepted: production has no delivered lines; deploy right after `db push`, tick nothing in between (in the deploy notes)                  |
| 3   | OBSERVATION | `lineId` is the first internal id on a guest route                                                       | Accepted and documented in CLAUDE.md as the one exception (re-checked under the row lock, foreign/unknown → the same 409)                |
| 4   | OBSERVATION | New JS + an old server instance would crash the board / restaurant island (missing `deliveredPieces`)   | Fixed: `deliveredPiecesOf` in `pieces.ts` and the marks in `OrderLineRow` tolerate answers without the fields                            |
| 5   | OBSERVATION | An open edit form drops its draft when a poll moves the line to another placement group                 | Accepted: needs a publish in another tab while editing                                                                                    |
| 6   | OBSERVATION | A guest marked absent after the publish still sees and marks their table's lines                        | Accepted: matches the seat view and the TV (the latest snapshot)                                                                          |
| 7   | OBSERVATION | The indeterminate „Wydane” box marks the rest on the first click, clears on the second                   | Accepted: standard checkbox behaviour                                                                                                     |
