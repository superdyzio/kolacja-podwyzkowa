---
change_id: organizer-reset
title: Organizer resets chosen parts of the event data from one modal in one click
status: implementing
created: 2026-10-30
updated: 2026-10-30
archived_at: null
---

## Notes

Intent: organizer-only „Reset danych” card at the bottom of the organizer shell /o/<key> with a „Resetuj…” button opening a modal that lists reset parts (guesses, aiUsage, seating, guests, venue, questions, guestLinks) as checkboxes with descriptions and live counts, „Zaznacz wszystko”, and one red „Resetuj zaznaczone” button; one-click reset in one DB transaction; organizer and TV keys never change. User request 2026-10-30: „przycisk do resetu, gdzie w modalu pyta mnie o to jakie rzeczy zresetować i mogę to załatwić jednym klikiem”. Sources: context/foundation/prd.md (Access Control), CLAUDE.md, context/foundation/overnight-brief.md.

Parts agreed with the user (via the orchestrator):

1. `guesses` „Strzały” — delete every guess, `correct_amount_grosze` = null, `guess_intake_open` = true.
2. `aiUsage` „Licznik tematów AI” — delete every `ai_topic` attempt row (usage 0/300, every guest 5/5 again).
3. `seating` „Rozsadzenie i historia” — delete every `seat_assignment` (pins too) and ALL published snapshots → TV shows nothing published, neighbour history from zero.
4. `guests` „Goście i grupy” — delete all guests and groups; implies 1, 2 and 3 (auto-ticked and locked in the UI, enforced server-side).
5. `venue` „Plan, sale i stoliki” — delete the plan image, rooms and tables; implies 3.
6. `questions` „Pytania” — restore the starter base: delete all questions, then load the 90 starter questions.
7. `guestLinks` „Linki gości” — a fresh access key for every guest and `guest_access_enabled` = false; printed cards stop working (meaningless with 4 ticked — handled gracefully).

The organizer and TV keys never change; the event row is never deleted. After a reset the organizer's offline-readout memory (`kolacja-podwyzkowa:odczyt:*`) is cleared.
