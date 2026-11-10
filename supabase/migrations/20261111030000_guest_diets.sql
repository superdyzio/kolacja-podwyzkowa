-- guest-import-diets (S-23; PRD v2 FR-035, FR-036, US-07, NFR-021): a diet or allergy per guest.
--
-- Two columns on the guest row, so the event's cascade, the reset part `guests` and the later retention (S-26) take
-- them with the guest:
--   diets     — a set of known tags (the kitchen's fixed list; the labels live in the app, src/lib/diets/);
--   diet_note — a short free text for the kitchen and the staff („alergia na seler”, „bez cebuli”), or null.
-- Existing guests get none ('{}' / null).
--
-- Health data (GDPR art. 9). Only the client (organizer link), the event restaurant's staff (panel, the per-event
-- waiter's floor) and the kitchen tablet read them. They are NEVER copied into seating snapshots — the TV, the guests'
-- phones (seat, tablemates, the drawing) and the client's offline readout read snapshots only — and never go into an AI
-- prompt (NFR-021). The staff views join the snapshot's seats to the live guest rows at read time.

alter table public.guest
  add column diets text[] not null default '{}'::text[],
  add column diet_note text;

alter table public.guest
  add constraint guest_diets_known check (
    diets <@ array[
      'vegetarian', 'vegan', 'gluten-free', 'lactose-free', 'nut-allergy', 'seafood-allergy', 'halal', 'no-pork'
    ]
  ),
  add constraint guest_diets_size check (cardinality(diets) <= 8),
  add constraint guest_diet_note_length check (diet_note is null or char_length(diet_note) between 1 and 120);

comment on column public.guest.diets is
  'guest-import-diets: diet and allergy tags (health data; never in snapshots, guest or TV answers, or AI prompts).';
comment on column public.guest.diet_note is
  'guest-import-diets: a note for the kitchen and the staff, 1–120 characters (health data; same rules as diets).';
