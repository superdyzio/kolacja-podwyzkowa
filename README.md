# Kolacja podwyżkowa

Aplikacja webowa do prowadzenia corocznej kolacji podwyżkowej: rozsadzenie gości z rotacją, widok TV z planem sal, telefony gości (miejsce, pytania, strzały) i ranking strzałów dla organizatora. Nie ma kont: każdy widok otwiera się wyłącznie przez link z niezgadywalnym kluczem.

Dokumentacja produktu (PRD, roadmapa, stack) jest w `context/foundation/`.

## Stack

Astro 7 (SSR) + React 19 + TypeScript + Tailwind 4 + shadcn/ui, Supabase (Postgres), serwer Node (`@astrojs/node`) na AWS Lambda, Vitest.

## Uruchomienie lokalne

Wymagania: Node.js 22 (`.nvmrc`) i Docker.

```bash
npm install
npx supabase start -x gotrue,realtime,storage-api,imgproxy,studio,postgres-meta,mailpit,edge-runtime,logflare,vector,supavisor
npx supabase migration up
npm run env:local   # zapisuje SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY do .env
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

## Reset danych

Na dole panelu organizatora jest karta „Reset danych”. „Resetuj…” otwiera okno z listą rzeczy do wyczyszczenia, każda z opisem i aktualną liczbą: strzały (z prawidłową kwotą), licznik tematów AI, rozsadzenie z historią publikacji, goście i grupy, plan z salami i stolikami, pytania (wraca baza startowa) oraz linki gości (nowe linki, dostęp gości wyłączony — wydrukowane karteczki przestają działać). Goście pociągają za sobą strzały, licznik AI i rozsadzenie, a plan — rozsadzenie. Jedno kliknięcie „Resetuj zaznaczone” czyści wszystko naraz (jedna transakcja w bazie). Link organizatora i adres TV się nie zmieniają, więc np. po próbie generalnej wystarczy zresetować wszystko i od nowa wgrać dane (także `npm run demo`).

## Tematy AI

Goście i organizator generują temat do rozmowy od AI w wybranej kategorii. Gość ma najwyżej 5 tematów na wieczór, wszyscy razem (z organizatorem) 300; organizator nie ma osobnego limitu. Nieudana próba (np. przekroczony czas 9 s) nie zmniejsza limitu. Tematy nie są nigdzie zapisywane: widzi je tylko osoba, która je wygenerowała.

Domyślnie działa atrapa AI (`AI_PROVIDER=mock` albo brak zmiennej): przykładowe polskie tematy, bez połączenia z siecią i bez kosztów. Tak działają dev, testy i `npm run smoke`.

Żeby używać Claude:

1. W konsoli Anthropic utwórz klucz API i ustaw limit wydatków.
2. Dopisz do `.env` (lokalnie; `npm run env:local` zostawia te linie):

   ```bash
   AI_PROVIDER=anthropic
   ANTHROPIC_API_KEY=<klucz>
   # AI_MODEL=claude-haiku-5-5   # opcjonalnie; inny model działa na swoich domyślnych ustawieniach
   ```

   Na AWS: te same zmienne w `.env.aws` (patrz „Wdrożenie na AWS”).

3. Uruchom ponownie podgląd (`npx astro preview stop`, potem `npm run preview`; build nie jest potrzebny, sekrety są czytane przy starcie serwera) i wygeneruj jeden temat na `/o/<klucz>/pytania`. Panel „Temat od AI” pokazuje aktywnego dostawcę, a przy błędzie przyczynę (np. odrzucony klucz).

Bez klucza przy `AI_PROVIDER=anthropic` każda próba od razu się nie udaje, a panel organizatora mówi dlaczego. Klucz jest sekretem serwera i nigdy nie trafia do przeglądarki ani do repozytorium. Testy nigdy nie łączą się z API Anthropic, a `npm run smoke` wymaga atrapy.

## Skrypty

- `npm run dev`, `npm run build`, `npm run preview`: serwer deweloperski, build produkcyjny, podgląd buildu.
- `npm test`: testy jednostkowe i integracyjne. Integracyjne działają tylko z lokalnym Supabase (`SUPABASE_URL` na `127.0.0.1`), inaczej są pomijane.
- `npm run lint`, `npx astro check`: lint i sprawdzanie typów.
- `npm run env:local`: zapisuje dane lokalnego Supabase do `.env` (jedyny plik ze zmiennymi; stary `.dev.vars` z czasów Cloudflare nie jest już używany).
- `npm run links`: wypisuje link organizatora i adres TV z bazy.
- `npm run smoke`: test HTTP macierzy dostępu na działającym serwerze (`BASE_URL`, domyślnie `http://localhost:4321`). Wymaga bazy bez wydarzenia. `npm run preview` czyta `.env` przy starcie, więc po zmianie `.env` uruchom podgląd ponownie.
- `npm run demo`: wypełnia lokalną aplikację danymi demo do sprawdzeń ręcznych (40 gości, plan, 3 sale, 7 stolików, grupy 4/2/2, 1 nieobecny, 1 przypięty, opublikowany rozkład, 30 strzałów z remisem) przez API działającego serwera (`BASE_URL`) i wypisuje linki. Tworzy wydarzenie, gdy go nie ma; odmawia, gdy wydarzenie ma już gości, sale albo plan.

## CI

GitHub Actions (`.github/workflows/ci.yml`) na gałęzi `main`:

- `ci`: lint, `astro check`, `npm test` (bez testów bazy) i build.
- `smoke`: lokalny Supabase, `npm test` z testami bazy, build, podgląd produkcyjny i `npm run smoke`.

## Deploy

AWS Lambda za adresem Function URL (AWS Lambda Web Adapter przed serwerem Node) i hostowany Supabase. Klucz service role omija RLS, więc nigdy nie trafia do przeglądarki ani do repozytorium.
