# Kolacja podwyżkowa

Aplikacja webowa do prowadzenia corocznej kolacji podwyżkowej: rozsadzenie gości z rotacją, widok TV z planem sal, telefony gości (miejsce, pytania, strzały) i ranking strzałów dla organizatora. Nie ma kont: każdy widok otwiera się wyłącznie przez link z niezgadywalnym kluczem.

Dokumentacja produktu (PRD, roadmapa, stack) jest w `context/foundation/`.

## Stack

Astro 7 (SSR) + React 19 + TypeScript + Tailwind 4 + shadcn/ui, Supabase (Postgres), Cloudflare Workers, Vitest.

## Uruchomienie lokalne

Wymagania: Node.js 22 (`.nvmrc`) i Docker.

```bash
npm install
npx supabase start -x gotrue,realtime,storage-api,imgproxy,studio,postgres-meta,mailpit,edge-runtime,logflare,vector,supavisor
npx supabase migration up
npm run env:local   # zapisuje SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY do .env i .dev.vars
npm run dev
```

Otwórz http://localhost:4321/, kliknij „Utwórz wydarzenie” i od razu dodaj link organizatora do zakładek. Adres TV jest w panelu organizatora. Jeśli zgubisz link, wypisze go `npm run links`.

## Dostęp

| Widok       | Adres         | Uwagi                                            |
| ----------- | ------------- | ------------------------------------------------ |
| Organizator | `/o/<klucz>`  | wszystko; link do zakładek, nie udostępniać      |
| TV          | `/tv/<klucz>` | tylko do odczytu, na urządzeniu przy telewizorze |
| Gość        | `/g/<klucz>`  | osobisty link/QR (w kolejnych etapach)           |
| Inne        | —             | strona „Brak dostępu” (HTTP 404), żadnych danych |

## Skrypty

- `npm run dev`, `npm run build`, `npm run preview`: serwer deweloperski, build produkcyjny, podgląd buildu.
- `npm test`: testy jednostkowe i integracyjne. Integracyjne działają tylko z lokalnym Supabase (`SUPABASE_URL` na `127.0.0.1`), inaczej są pomijane.
- `npm run lint`, `npx astro check`: lint i sprawdzanie typów.
- `npm run env:local`: zapisuje dane lokalnego Supabase do `.env` i `.dev.vars`.
- `npm run links`: wypisuje link organizatora i adres TV z bazy.
- `npm run smoke`: test HTTP macierzy dostępu na działającym serwerze (`BASE_URL`, domyślnie `http://localhost:4321`). Wymaga bazy bez wydarzenia. Build kopiuje `.dev.vars` do `dist/`, więc po zmianie `.dev.vars` przebuduj przed `npm run preview`.

## CI

GitHub Actions (`.github/workflows/ci.yml`) na gałęzi `main`:

- `ci`: lint, `astro check`, `npm test` (bez testów bazy) i build.
- `smoke`: lokalny Supabase, `npm test` z testami bazy, build, podgląd produkcyjny i `npm run smoke`.

## Deploy

Cloudflare Workers (`npx wrangler deploy`) wymaga konta właściciela. Sekrety `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` ustawia się przez `npx wrangler secret put`. Klucz service role omija RLS, więc nigdy nie trafia do przeglądarki ani do repozytorium.
