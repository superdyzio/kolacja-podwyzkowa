# Overnight log

Dziennik decyzji, zależności i blokerów nocnego builda (zasady: `overnight-brief.md`).

## Decyzje

- 2026-10-27 — roadmapa: `top_blocker: time` przyjęty z rekomendacji (użytkownik poszedł spać z poleceniem „zakładaj rekomendowane odpowiedzi”).
- 2026-10-27 — wykonanie: każdy slice planuje i implementuje osobny subagent, po kolei (nigdy równolegle), żeby oszczędzać zasoby maszyny i trzymać czysty kontekst; sesja główna weryfikuje testy, lint i build po każdym slice'ie.
- 2026-10-27 — zasoby: lokalny Supabase uruchamiany tylko z potrzebnymi usługami; bez testów w prawdziwej przeglądarce w nocy (Playwright pominięty), weryfikacja testami jednostkowymi i integracyjnymi na lokalnej bazie.
- 2026-10-27 — F-01 /10x-plan, złożoność: MEDIUM (10 pytań) — zgoda z oceną skilla.
- 2026-10-27 — F-01 tworzenie wydarzenia: `/` pokazuje jednorazowy przycisk „Utwórz wydarzenie”, gdy wydarzenia nie ma; po utworzeniu przekierowanie do `/o/<klucz>`, gdzie są link organizatora (do zakładek) i adres TV; gdy wydarzenie istnieje, `/` pokazuje tylko „dostęp tylko przez link od organizatora” (Recommended).
- 2026-10-27 — F-01 format klucza: 18 losowych bajtów (144 bity, Web Crypto) w base64url = 24 znaki `[A-Za-z0-9_-]`; osobny klucz dla organizatora i TV; trzymane jawnie w bazie (organizator musi je wyświetlać i drukować) (Recommended).
- 2026-10-27 — F-01 egzekwowanie dostępu: centralnie w middleware dla prefiksów `/o/`, `/tv/`, `/g/` i `/api/o|tv|g/`; wynik w `Astro.locals.access`; strony dodatkowo sprawdzają rolę (Recommended).
- 2026-10-27 — F-01 odmowa: polska strona braku dostępu z HTTP 404 (ta sama co dla nieznanych tras), JSON 404 dla API; ta sama odpowiedź dla złego formatu i nieznanego klucza; na trasach z kluczem `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, `X-Robots-Tag: noindex` (Recommended).
- 2026-10-27 — F-01 błąd bazy ≠ brak dostępu: błąd zapytania (np. zły klucz service role) daje stronę 500 „coś poszło nie tak”, a nie 404, żeby rano nie mylić konfiguracji z brakiem dostępu (Recommended, rada recenzenta).
- 2026-10-27 — F-01 zgubiony link organizatora: `npm run links` wypisuje linki organizatora i TV z bazy (kluczem service role z `.env`); bez odzyskiwania w apce (Recommended).
- 2026-10-27 — F-01 testy integracyjne: Vitest wywołuje rdzeń decyzji dostępu (bez modułów `astro:*`) przeciw lokalnej bazie; uruchamiane tylko gdy `SUPABASE_URL` wskazuje na `127.0.0.1`/`localhost`, inaczej pomijane; HTTP 404 sprawdza `npm run smoke` na buildzie produkcyjnym (Recommended).
- 2026-10-27 — F-01 higiena danych testów: testy używają istniejącego wydarzenia; jeśli same je utworzyły, usuwają je na końcu; nigdy nie usuwają cudzego wydarzenia; pliki testów uruchamiane po kolei (`fileParallelism: false`) (Recommended).
- 2026-10-27 — F-01 CI: job `ci` (lint, astro check, `npm test` z pominięciem testów DB, build) i job `smoke` (lokalny Supabase z tym samym okrojonym zestawem usług, `.env` ze skryptu, `npm test` z testami DB, build, preview, smoke) na gałęzi `main`; `supabase/setup-cli` przypięty do 2.117.0 (Recommended).
- 2026-10-27 — F-01 sprzątanie startera: usunięte strony/API/komponenty logowania, dashboard, Welcome/Topbar/LibBadge, `public/template.png`, utility `bg-cosmic`, zależność `@supabase/ssr`; zostają shadcn/ui (`button`), Tailwind, `Layout`, `Banner` (Recommended).
- 2026-10-27 — F-01 klucze lokalnego Supabase: `npx supabase status -o env` nie wypisuje kluczy przy wyłączonym gotrue, więc `npm run env:local` bierze `SERVICE_ROLE_KEY` ze statusu, a gdy go brak, podpisuje JWT `service_role` domyślnym lokalnym sekretem; sprawdza klucz jednym zapytaniem REST i zapisuje `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` do `.env` i `.dev.vars`, zachowując inne wpisy (Recommended).
- 2026-10-27 — F-01 nazwy: `package.json` i `wrangler.jsonc` `name` → `kolacja-podwyzkowa`; `supabase/config.toml` `project_id` bez zmian (od niego zależą nazwy kontenerów `supabase_*_10x-astro-starter`).

## Dodane zależności

(slice → pakiet → uzasadnienie)

- F-01 → `vitest@^5.0.5` (dev) → runner testów jednostkowych i integracyjnych (`npm test`); wspiera Vite 8 używany przez Astro 7, decyzja z briefu.
- F-01 → usunięty `@supabase/ssr` → służył tylko do sesji logowania e-mail ze startera; dostęp do bazy idzie teraz przez `@supabase/supabase-js` z kluczem service role po stronie serwera.

## Blokery

(brak)
