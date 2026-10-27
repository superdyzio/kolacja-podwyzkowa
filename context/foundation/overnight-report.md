# Raport poranny — nocny build kolacja-podwyzkowa

Stan na 2026-10-27 rano, branch `overnight/build` (lokalny, niewypchnięty).

## W skrócie

- Wszystkie 10 elementów roadmapy M-1 (F-01, S-01…S-09) jest zbudowanych, zarchiwizowanych i ma status `done`. Bloków nie było.
- Końcowa weryfikacja (orkiestrator, po ostatnim slice'ie) przeszła na zielono:
  - `npm test`: 68 plików, 730 testów (jednostkowe + integracyjne na lokalnej bazie);
  - `npm run lint`: 0 błędów;
  - `npx astro check`: 0 błędów;
  - `npm run build`: przechodzi;
  - `npm run smoke` na produkcyjnym podglądzie i pustej bazie: 351/351 PASS.
- AI działa wyłącznie na atrapie. Nie było żadnego płatnego wywołania ani klucza w repo.
- Nic nie zostało wypchnięte, zmergowane ani wdrożone. Na to czekają Twoje decyzje (niżej).
- Nie przeszedłem UI w prawdziwej przeglądarce (bez Playwright, zgodnie z poleceniem oszczędzania zasobów). Flow US-01..US-04 jest sprawdzony na poziomie tras HTTP i testów, a w przeglądarce sprawdza go Twoja poranna checklista.

## Co zrobione (slice → wymagania → commity)

| ID | Change ID | Co działa | PRD | Commity |
|---|---|---|---|---|
| — | przygotowanie | brief, scaffold 10x-astro-starter, roadmapa, allowlista | — | 7bb9e99, ec00b7f, 399ae13, 669bacc |
| F-01 | link-access-foundation | wydarzenie tworzone raz z `/`, sekretne linki `/o/<klucz>` i `/tv/<klucz>`, reszta = 404, Vitest, CI | NFR-009, Access Control | 65d04f9 … d4386cd |
| S-01 | guest-list-and-groups | wklejanie i edycja gości, grupy 2–5 osób, nieobecni (`/o/<klucz>/goscie`) | US-01, FR-001..003 | d85ec61 … 434555a |
| S-02 | rooms-and-tables-on-plan | zrzut planu, sale, pinezki stolików z typem i liczbą miejsc (`/sale`) | US-01, FR-005, FR-006 | 35ceac3 … 121be9c |
| S-03 | manual-seating-on-tv | ręczne sadzanie, przypięcia, publikacja, TV z imionami na planie i odświeżaniem ≤ 5 s (`/rozsadzenie`, `/tv/<klucz>`) | US-01, FR-004, FR-007, FR-008, NFR-003, NFR-006 | 587ac16 … ea1eb67 |
| S-04 | reshuffle-draft-and-publish | losowanie projektu w przeglądarce organizatora (grupy razem, bez powtórek sąsiadów), poprawki, publikacja, „Wróć do poprzedniego” | US-02, FR-009, FR-010, NFR-007 | 5bb0a86 … 53e7b8e |
| S-05 | guest-links-and-seat-view | włącznik dostępu gości, osobiste linki, karteczki A4 z QR, strona gościa z miejscem na żywo (`/linki`, `/karteczki`, `/g/<klucz>`) | US-03, FR-011..013, NFR-003, NFR-008, NFR-009 | 2fcacab … 7b311aa |
| S-06 | guesses-and-ranking | strzały gości (zł z groszami), zamykanie przyjmowania, prawidłowa kwota, ranking z remisami, „Czytaj od końca” (`/strzaly`) | US-04, FR-017..020, NFR-001 | 5d5fa53 … a4c24c6 |
| S-07 | question-base-and-draw | baza pytań (90 startowych), wklejka i edycja, losowanie w kategorii u gościa i organizatora (`/pytania`) | US-03, FR-014, FR-015 | 0839a98 … 485790f |
| S-08 | ai-topics-with-limits | tematy AI w kategorii: limit 5 na gościa, 300 na wieczór; nieudane próby nie zjadają limitu; atrapa domyślnie, adapter Claude gotowy | US-03, FR-016, NFR-005, NFR-010 | b519d6e … 10ffe79 |
| S-09 | organizer-offline-readout | ostatni rozkład i ranking zapisane u organizatora, odczyt bez sieci (komunikat w stronie + `/o/<klucz>/odczyt` przez service worker) | US-04, FR-020, NFR-004 | 2216f3c … 009173c |

Szczegóły każdej zmiany: `context/archive/2026-10-27-<change-id>/` (plan, brief, postęp). Wszystkie decyzje podjęte za Ciebie (opcja „Recommended”) są w `context/foundation/overnight-log.md` → „Decyzje”.

## Zablokowane / czego potrzeba od Ciebie

Blokerów w budowie nie było. Na Ciebie czekają decyzje, których nie wolno mi było podjąć:

1. **Przegląd i merge** `overnight/build` → `main` oraz push. Branch ma 90 commitów ponad `main` i nie jest wypchnięty. Lokalny `main` jest 3 commity przed `origin/main`, też niewypchnięty.
2. **Wdrożenie** (Open Question 6): konto Cloudflare i hostowana baza Supabase, sekrety `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY`, migracje na zdalnej bazie. Konfiguracja CI jest w `.github/workflows/ci.yml`. Deploy nie był uruchamiany.
3. **Klucz AI** (Open Question 5): klucz Anthropic z limitem wydatków, potem `AI_PROVIDER=anthropic` i `ANTHROPIC_API_KEY` (opis w README i w checkliście S-08 5.5).
4. **`npm audit`**: 14 podatności (11 high, 2 moderate, 1 low), w zależnościach produkcyjnych 13 (10 high). Bezpośrednie to tylko `wrangler` (high) i `astro` (low). `npm audit fix` nie był uruchamiany, bo zmienia zależności.
5. **Zamknięcie kamienia M-1**: zostawiłem go otwartego. Zamknij przez `/10x-roadmap` po porannych sprawdzeniach.

## Jak uruchomić lokalnie

```bash
# 1. Baza w Dockerze (tylko db + REST + gateway, ~450 MB RAM)
npx supabase start -x gotrue,realtime,storage-api,imgproxy,studio,postgres-meta,mailpit,edge-runtime,logflare,vector,supavisor
npx supabase migration up
npm run env:local          # zapisuje SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY do .env i .dev.vars

# 2a. Serwer deweloperski
npm run dev                # http://localhost:4321

# 2b. albo produkcyjny podgląd (wymagany dla workera offline S-09 i dla smoke)
npm run build && npm run preview
npx astro preview stop     # zatrzymanie podglądu

# 3. Na http://localhost:4321/ kliknij „Utwórz wydarzenie”, zapisz link organizatora w zakładkach
npm run links              # wypisuje link organizatora i TV, gdy zginie

# Testy
npm test && npm run lint && npx astro check
npm run smoke              # na działającym podglądzie i PUSTEJ bazie (smoke sam tworzy wydarzenie)
```

Czyszczenie lokalnej bazy przed `npm run smoke` (usuwa wydarzenie razem ze wszystkim, kaskadowo):

```bash
node --env-file=.env -e 'const h={apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+process.env.SUPABASE_SERVICE_ROLE_KEY};const r=await fetch(process.env.SUPABASE_URL+"/rest/v1/event?id=gte.0",{method:"DELETE",headers:h});console.log(r.status)'
```

(albo `npx supabase db reset`, które odtwarza bazę z migracji).

Telefony w tej samej sieci: `http://<IP laptopa>:4321`. Na zwykłym http w sieci kopiowanie do schowka i worker offline nie działają; to ograniczenie przeglądarek, na https zadziała.

## Ręczna checklista na rano

Pełne kroki są w `context/foundation/overnight-log.md` → „Do sprawdzenia rano (Manual)”. W skrócie, w kolejności przydatnej do sprawdzania:

- [ ] **S-07 1.5**: przejrzyj 90 pytań startowych w `context/foundation/question-seed.md` (Open Question 4); zmiany wprowadzaj w obu miejscach, czyli w tym pliku i w `src/lib/questions/seed.ts`.
- [ ] **F-01 4.6**: utwórz wydarzenie na pustej bazie i otwórz TV na drugim urządzeniu.
- [ ] **S-01 4.6**: goście i grupy na telefonie (~360 px).
- [ ] **S-02 4.6**: prawdziwy zrzut planu, 3 sale, 7 stolików, pinezki.
- [ ] **S-03 4.6 / 5.6**: ręczne sadzanie i przypięcia; TV 16:9 czytelny z sali, zmiana na TV ≤ 5 s.
- [ ] **S-04 5.6**: „Wylosuj projekt” daje 0 powtórek, grupy razem, publikacja, powrót do poprzedniego.
- [ ] **S-05 4.4 / 5.4**: linki, wydruk karteczek (QR skanuje się), strona gościa na iOS i Androidzie.
- [ ] **S-06 4.4 / 5.4**: strzał na telefonie, zamknięcie, „Czytaj od końca” z remisami.
- [ ] **S-07 4.4 / 5.4**: losowanie pytań u gościa i organizatora, wklejka, edycja.
- [ ] **S-08 4.4 / 5.6**: tematy AI na atrapie: licznik 5 na gościa i 300 na wieczór.
- [ ] **S-08 5.5**: pierwszy prawdziwy temat od Claude po dodaniu klucza (jedyne płatne wywołania).
- [ ] **S-09 4.4**: wyłącz Wi-Fi i sprawdź odczyt rozkładu i rankingu, także po odświeżeniu strony (https albo localhost z `npm run preview`).
- [ ] **F-01 5.6**: pierwszy przebieg CI na GitHubie po pushu na `main`.

## Dodane zależności

| Slice | Pakiet | Po co |
|---|---|---|
| F-01 | `vitest` (dev) | testy jednostkowe i integracyjne |
| F-01 | usunięty `@supabase/ssr` | służył tylko logowaniu e-mail ze startera, które zostało usunięte |
| S-05 | `qrcode` | kody QR na karteczkach (tylko w przeglądarce organizatora) |
| S-05 | `@types/qrcode` (dev) | typy do `qrcode` |
| S-05 | `jsqr` (dev) | test, że wydrukowany QR dekoduje się do linku |

S-06…S-09 nie dodały żadnych pakietów. AI idzie przez zwykły `fetch`, bez SDK.

## Open Questions z PRD

| # | Pytanie | Stan po nocy |
|---|---|---|
| 1 | Układ lokalu i zrzut planu (do 2026-11-05) | Otwarte, po Twojej stronie. Aplikacja przyjmie dowolny układ (do 10 sal, 40 stolików, 2–20 miejsc). |
| 2 | Czytelność imion na TV (do 2026-11-06) | Otwarte. Widok TV ma imiona na co najmniej 2,5% wysokości ekranu i karty rozsuwane, żeby się nie nakładały; sprawdzić na prawdziwym TV (S-03 5.6). |
| 3 | Próba generalna z telefonami, TV i hotspotem (do 2026-11-06) | Otwarte. Wymaga wdrożenia (pkt 6); odczyt bez sieci (S-09) jest gotowy. |
| 4 | Przegląd bazy pytań (do 2026-11-05) | Do przeglądu: 90 pytań w `question-seed.md`. |
| 5 | Klucz AI i limit wydatków (do 2026-11-05) | Kod gotowy, działa na atrapie. Brakuje tylko klucza i limitu u dostawcy. |
| 6 | Publiczny adres (do 2026-11-04) | Otwarte. Stack wybrany (Cloudflare + Supabase), CI przygotowane; potrzebne Twoje konta i zgoda na deploy. |

## Ryzyka i znane ograniczenia

- **UI nie był klikany w przeglądarce.** Wszystko poniżej poziomu HTTP jest przetestowane, ale układ na telefonach i TV, druk i skanowanie QR oraz worker offline sprawdza dopiero checklista.
- **Karteczki drukowane z `localhost` mają adres localhost.** Finalne karteczki drukuj z publicznego adresu.
- **Obraz planu w Workerze.** „Pokaż na planie” na telefonach i TV dekoduje base64 całego planu przy każdym żądaniu. Przy wielu telefonach naraz i dużym zrzucie może to zbliżyć się do limitu CPU Cloudflare (~10 ms). Warto użyć zrzutu ≤ 1–2 MB i sprawdzić na próbie.
- **Hostowana baza nie była testowana.** Limity rozmiaru żądań hostowanej Supabase (plan do 5 MB jako base64) i deploy na Cloudflare zweryfikujesz przy wdrożeniu.
- **Adapter Claude jest sprawdzony tylko na zaślepce sieci.** Nagłówek `anthropic-version: 2026-10-21` i model `claude-haiku-5-5` pochodzą z dokumentacji API, nie z prawdziwego wywołania (potwierdzi to S-08 5.5).
- **Worker offline (S-09) działa tylko na https albo na localhost w buildzie produkcyjnym.** Na zwykłym http w sieci lokalu działa tylko komunikat w otwartej stronie.
- **Wersja Node.** Lokalnie jest Node 24.15, a `.nvmrc` mówi 22.14. Wtyczki ESLint ostrzegają EBADENGINE (chcą ≥ 24.16), ale działają.
- **Hook pre-commit (husky) nie jest podpięty w tym klonie.** Lint uruchamiałem ręcznie przed commitami. Po sklonowaniu na nowo `npm install` powinien go podpiąć.
