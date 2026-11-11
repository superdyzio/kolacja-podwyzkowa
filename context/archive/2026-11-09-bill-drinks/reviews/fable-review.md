# Fable review — bill-drinks (f0e995a)

Verdict: nothing serious; safe to ship with the documented order (`db push` → `deploy:aws`). Migration diff vs
20261102120000: the re-created `reset_counts` / `reset_event` differ only by the drink count term and the drink delete;
grants and RLS as for `order_item`; leak paths (restaurant, TV, guest) and write access checked.

| # | Finding | Decision |
|---|---------|----------|
| 1 | New code on the old DB: `getOrderBoard` fails, so `/zamowienia` and every order route (incl. „Wydane”) are a 500 | Fixed: `getDrinkItems` answers `[]` and logs on `PGRST205` / `42P01` (unit test with a stub client) |
| 2 | The totals card repeats the dishes' amount under the bill total; „Brak zamówień” under a non-zero bill | Fixed: `formatServedSummary` (count and „wydane”, no amount; nothing without dishes) |
| 3 | The reset count „pozycji zamówienia” includes drinks | Kept: the part is labelled „Zamówienia i napoje”; the count stays one number for the strict schema |
| 4 | CLAUDE.md still pointed at 20261102 as the latest reset functions | Fixed: points at 20261108 as the version to copy |
