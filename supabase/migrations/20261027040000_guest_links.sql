-- S-05 guest-links-and-seat-view: personal guest links and the guest-access switch (PRD FR-011, FR-012, FR-013,
-- NFR-009, Access Control).
--
-- guest.access_key: the guest's personal link key (/g/<key>). Same format as the organizer and TV keys: 18 random
--   bytes (144 bits, CSPRNG) in base64url = 24 characters. The column default fills every existing guest with a
--   distinct key when the column is added and gives one to every new row, whatever inserts it. Revoking a link =
--   the app writes a new key (src/lib/access/keys.ts generateAccessKey()); the old link is dead immediately because
--   nothing else stores it.
-- event.guest_access_enabled: the organizer's switch. Off by default: guest links open nothing until the organizer
--   turns guest access on. Off, revoked, unknown and cross-role keys all get the same "brak dostępu" answer.
--
-- Access model as in the earlier migrations: browser roles get nothing (privileges on both tables are already
-- revoked from anon/authenticated; RLS on, no policies).

create extension if not exists pgcrypto with schema extensions;

alter table public.guest
  add column access_key text not null
    default translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_'),
  add constraint guest_access_key_format check (access_key ~ '^[A-Za-z0-9_-]{24}$');

create unique index guest_access_key_key on public.guest (access_key);

comment on column public.guest.access_key is
  'Personal guest link key (/g/<key>): 18 random bytes in base64url (24 chars); replaced when the link is revoked.';

alter table public.event
  add column guest_access_enabled boolean not null default false;

comment on column public.event.guest_access_enabled is
  'Guest access switch (FR-012): guest links open nothing while false (the default).';
