---
change_id: bill-drinks
title: The organizer enters the drinks on the restaurant's bill to check the bill when settling up
status: archived
created: 2026-11-08
updated: 2026-11-09
archived_at: 2026-11-09T19:50:25Z
---

## Notes

User request (2026-11-08, the evening of the dinner): „potrzebuję jeszcze do wyliczenia rachunku możliwość wprowadzenia
napoi z perspektywy admina - nazwa, cena i ilość, bez przypisania do ludzi, ludzie też nie muszą tego widzieć, tylko
dla mnie do double checku rachunku przy rozliczeniu z restauracją”.

Decisions (mine, not asked — the dinner is today):

- A separate table `drink_item`, not a flag on `order_item`: the order lines feed the restaurant's view and its token,
  the prep list, the placement, the serving highlight, the guest's phone and the piece counts; a drink in that table
  would need a filter in each of them. The new table is read only by the organizer's order board.
- Name, unit price (the dishes' price rules) and quantity 1–999 (a round of beers for 40 is one line); edit and delete;
  suggestions of drinks already entered with their newest price. No note, no assignment, no „wydane”.
- The restaurant does not see the drinks either („tylko dla mnie”).
- `/zamowienia`: the totals card becomes „Rachunek razem” = dishes + drinks, with „Dania: … · Napoje: …”; the drinks
  panel sits at the bottom. The dishes' own totals and „wydane X z Y szt.” are unchanged; the shell card is unchanged
  (the shell never reads the new table, so a code-before-migration deploy cannot break the main panel).
- Reset: the part „Zamówienia” → „Zamówienia i napoje” deletes the drinks too; `reset_counts` keeps its JSON shape
  (`orders` counts both), because `ResetCountsSchema` is strict and pages on the older code read it between `db push`
  and the deploy.
- Not wired into the guessing contest's correct amount (that stays the organizer's own entry).

Checked: lint, `astro check`, 1039 tests on a fresh local DB (unit, integration `drinks.test.ts`, reset with a drink),
build, smoke 531/531 on a fresh DB (22 new: the drinks never reach the restaurant's page and API, the TV page and poll,
the guest's page and poll; refusals; other keys; reset), headless screenshots (desktop and phone, no console errors).

Deploy: migration first (`getOrderBoard` reads `drink_item`), then the code.
