-- event-branding (S-18, PRD v2 FR-032): the restaurant's brand (name — already there —, colour, logo), set by its
-- owner, and the client's brand of one event (company or event name, logo), set by the client (or the staff while the
-- venue leads). Guests, the TV, the tablet, the QR cards and the panel show them; the platform's name never reaches a
-- guest.
--
-- Additive only: two nullable columns and two new singleton tables, so code from before keeps working on the migrated
-- database. Logos live in their own tables (like venue_plan) so a blob never rides along with a read of `event` or
-- `restaurant`. The image is stored as base64 text (PostgREST would send bytea as hex, 2×); the app decides its type
-- from the magic bytes (PNG, JPEG, WebP — never SVG) and allows at most 512 KiB (524 288 B = 699 052 base64 chars).

alter table public.restaurant
  add column brand_color text
    constraint restaurant_brand_color_format check (brand_color is null or brand_color ~ '^#[0-9a-f]{6}$');

alter table public.event
  add column brand_name text
    constraint event_brand_name_length check (brand_name is null or char_length(brand_name) between 1 and 80);

create table public.restaurant_logo (
  restaurant_id integer primary key references public.restaurant (id) on delete cascade,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  byte_size integer not null check (byte_size between 1 and 524288),
  image_base64 text not null check (char_length(image_base64) between 4 and 699052),
  updated_at timestamptz not null default now()
);

create table public.event_logo (
  event_id integer primary key references public.event (id) on delete cascade,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  byte_size integer not null check (byte_size between 1 and 524288),
  image_base64 text not null check (char_length(image_base64) between 4 and 699052),
  updated_at timestamptz not null default now()
);

alter table public.restaurant_logo enable row level security;
alter table public.event_logo enable row level security;
revoke all on table public.restaurant_logo from anon, authenticated;
revoke all on table public.event_logo from anon, authenticated;
