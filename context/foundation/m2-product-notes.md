---
project: kolacja-podwyzkowa
context_type: brownfield
created: 2026-11-09
source: sesja interaktywna 2026-11-09 („product”), decyzje użytkownika przez AskUserQuestion
milestone: M-2 produktyzacja (platforma dla restauracji)
---

# M-2: produktyzacja — notatki z sesji 2026-11-09

## Skąd to się wzięło

Restauracja, w której odbyła się kolacja 2026-11-08, była zachwycona narzędziem. Robi często duże wydarzenia i chce go używać sama. Celem jest produkt, który pokażemy restauracji na demo. Wcześniej ma być nocna sesja implementacji (ok. 8 h, bez nadzoru). Backlog ma być pełny i sensownie ułożony. Noc robi z niego po kolei tyle, ile zdąży, a każdy ukończony slice zostawia aplikację zieloną i gotową do pokazania.

## Decyzje użytkownika (2026-11-09)

| Temat | Decyzja |
|---|---|
| Model | **Platforma dla wielu restauracji (SaaS)**: każda restauracja ma swoje wydarzenia, dane restauracji są od siebie odizolowane. |
| Onboarding restauracji | **Restauracje zakłada administrator platformy (użytkownik)** i daje właścicielowi link zaproszenia. Samodzielna rejestracja i płatności są zaparkowane. |
| Logowanie personelu | **Własne konta, bez e-maili**: e-mail + hasło (scrypt z wbudowanego `node:crypto`, bez nowej zależności), sesje w bazie, ciasteczko HttpOnly, limit prób logowania. Zaproszenia i reset hasła to linki jednorazowe, które kopiuje właściciel lokalu albo administrator platformy. Aplikacja nie wysyła żadnych maili. |
| Kto prowadzi wydarzenie | **Lokal tworzy, klient rozsadza**. Restauracja zakłada wydarzenie (z szablonu sali) i przekazuje klientowi (para młoda, firma) link organizatora: goście, grupy, rozsadzenie, linki gości, pytania, gra. Tylko restauracja widzi zamówienia, ceny, napoje, rachunek, reset, koszty AI, włączniki modułów, wymianę kluczy i usuwanie. |
| Skala | **Do 150 gości na wydarzenie.** |
| Dane produkcyjne | **Nowy projekt Supabase dla platformy.** Stary projekt zostaje archiwum kolacji 2026-11-08. Migracje M-2 i tak muszą przejść na bazie z danymi: lokalne bazy i CI mają wydarzenie 1, które trafia wtedy do restauracji „domyślnej”. Produkcji nic nie dotyka. |
| Dodatki | Wszystkie cztery zaproponowane: szablony sal, moduły i branding, import CSV/Excel z dietami, wydruki dla sali. Użytkownik dopisał: „inne pomysły też mile widziane, budujemy sensowny backlog i implementujemy tak dużo, jak to możliwe, zanim umówię się z nimi na demo”. |

## Role po zmianie

| Rola | Jak wchodzi | Zakres |
|---|---|---|
| Administrator platformy | konto (flaga platformowa), pierwsze z CLI | zakłada restauracje, zaprasza właścicieli, wyłącza restauracje; nie widzi danych gości bez potrzeby |
| Właściciel lokalu | konto | wszystko w swojej restauracji + zespół (zaproszenia, link resetu hasła, usunięcie) |
| Personel lokalu | konto | wydarzenia, szablony sal, menu, zamówienia, linki, moduły, branding; bez zarządzania zespołem |
| Obsługa (kelner) | dotychczasowy link `/r/<klucz>` na tablecie (bez kont) | podgląd serwowania, bez cen |
| Klient (organizator) | link `/o/<klucz>` od restauracji | goście, grupy, sale i stoliki (edycja jak dziś; blokada układu przez lokal zaparkowana), rozsadzenie, linki gości, karteczki, pytania, gra w zgadywanie, „Pokaż na TV” |
| TV, gość | bez zmian (`/tv/<klucz>`, `/g/<klucz>`) | bez zmian, w obrębie swojego wydarzenia |

Na noc są dwie role personelu: właściciel i personel. Rola menedżera i konta kelnerów są zaparkowane, bo da się je dodać później bez przeróbek.

## Stan kodu (najważniejsze dla planu)

- **Jedno wydarzenie jest wpisane na sztywno.** Tabela `event` ma `event_singleton check (id = 1)`. W 10 serwisach jest `EVENT_ID = 1` (45 miejsc), a każda kolumna `event_id` ma `default 1`. Funkcje DB bez parametru wydarzenia (`publish_seating()`, `replace_seating`, `seat_guest`, `create_guest_group`, `apply_venue_layout`, `set_order_pieces`, `save_guest_guess*`) działają na „wszystkim”. Blokady doradcze 3003 i 3008 są globalne.
- **Co już pomaga:** indeksy unikalne są per `event_id` (goście, sale, stoliki, pytania). `resolveAccess` zwraca wydarzenie dla każdej roli. Klucze są globalnie unikalne. Przeróbka jest szeroka, ale mechaniczna: `eventId` trzeba przeprowadzić z dostępu do serwisów.
- **Do zastąpienia:** `/` zakłada wydarzenie każdemu, kto wejdzie na puste wdrożenie. Zgubiony link organizatora da się dziś odzyskać tylko przez `npm run links` w CLI.
- **Rzeczy specyficzne dla tej kolacji:** nazwa „Kolacja podwyżkowa” w `Layout.astro`, `shell/messages.ts` i prompcie AI; gra „Ile kosztowała cała kolacja?”.
- **Limity:** 100 gości, 40 stolików, 10 sal, 2–20 miejsc przy stoliku (CHECK w DB i w snapshotach), losowanie mierzone dla 60 osób, TV czytelny dla ok. 40–60 imion.

## Backlog M-2 (kolejność = kolejność nocy)

Każdy slice zostawia zielone testy, lint, `astro check`, build, smoke i działające `npm run demo`. Kolejność wynika z zależności i z wartości na demo.

1. **F-02 `multi-tenant-events`: restauracje i wiele wydarzeń.**
   - Tabela `restaurant`. `event.restaurant_id` zastępuje singleton. Kolumna `event.id` przechodzi na typ szerszy niż `smallint` z zachowaniem danych.
   - `event` dostaje `starts_at` i `status` (szkic / aktywne / zarchiwizowane).
   - Zdjęcie `default 1` z kolumn `event_id`.
   - Każda funkcja DB dostaje `p_event_id` i sprawdza przynależność wierszy. Blokady są per wydarzenie (`pg_advisory_xact_lock(<stała>, p_event_id)`).
   - Serwisy biorą `eventId` z dostępu. `EVENT_ID` znika.
   - Migracja przenosi istniejące wydarzenie 1 do restauracji „domyślnej”.
   - Testy izolacji: klucz i dane wydarzenia A nigdy nie dotykają wydarzenia B. `/` przestaje zakładać wydarzenia. Ścieżkę przejściową dla smoke i demo (CLI albo trasa tylko lokalna) wybiera planer.
   - Uwagi projektowe:
     - `event.id` jako `integer`, bo dwuargumentowe `pg_advisory_xact_lock(int4, int4)` bierze `int4`.
     - Nowy parametr funkcji to nowa przeciążona wersja, a nie zamiana. Migracja musi jawnie wykonać `drop function` każdej starej sygnatury, inaczej wywołania PostgREST staną się niejednoznaczne (repo już raz na to trafiło przy `save_guest_guess_with_place`).
     - CLAUDE.md (sekcja o singletonie, `EVENT_ID`, „Created once from `/`”) jest częścią slice'a.
2. **F-03 `staff-accounts`: konta personelu i sesje.**
   - Tabele kont, członkostw (rola w restauracji), sesji (token losowy, w bazie tylko hash), zaproszeń i resetów (jednorazowe, z terminem ważności, hash).
   - Strony logowania i wylogowania, zmiana hasła, unieważnienie innych sesji przy zmianie hasła.
   - Limit nieudanych prób logowania w bazie (Lambda nie ma wspólnej pamięci).
   - Middleware strzeże `/panel/**` i `/api/panel/**`.
   - Pierwszy administrator platformy powstaje z CLI (`npm run platform:admin -- <email>` drukuje link zaproszenia).
   - PL/EN.
   - Bezpieczeństwo: ciasteczko sesji idzie z każdym żądaniem, więc pojawiają się zagrożenia, których model kluczy w linku nie miał.
     - **CSRF:** middleware sprawdza `Origin` przy każdej mutacji `/api/panel/**` niezależnie od typu treści. Wbudowane sprawdzenie Astro obejmuje tylko formularze. Ciasteczko ma `SameSite=Lax`, `HttpOnly` i `Secure` na https.
     - **IDOR:** trasy panelu niosą numer wydarzenia zamiast klucza. Jeden centralny strażnik (analog `organizerApi`) sprawdza członkostwo sesji w `event.restaurant_id`. Cudze albo nieznane id dostaje tę samą odpowiedź 404.
     - Smoke sprawdza dostęp krzyżowy: personel restauracji A pytający o wydarzenie B dostaje 404.
3. **S-10 `restaurant-panel`: panel platformy i panel lokalu.**
   - Administrator platformy: lista restauracji, zakładanie, link zaproszenia właściciela, wyłączenie restauracji.
   - Lokal: lista wydarzeń (nadchodzące / minione / archiwum), nowe wydarzenie (nazwa, data, liczba gości), karta wydarzenia z linkami (organizator dla klienta, TV, obsługa), wymiana każdego klucza (także organizatora), archiwizacja, trwałe usunięcie z potwierdzeniem.
   - Zespół: zaproszenie, rola, link resetu hasła, usunięcie.
4. **S-11 `client-restaurant-split`: rozdział klient / lokal.**
   - Zamówienia, ceny, napoje, rachunek, reset i koszty AI przechodzą do panelu lokalu dla wydarzenia (trasy `/panel/…` i `/api/panel/…` używają tych samych wysp z innym `apiBase`). Link organizatora ich nie pokazuje, a jego API odpowiada 404.
   - Personel otwiera z panelu każdą stronę organizatora swojego wydarzenia.
5. **S-12 `venue-templates`: szablony sal lokalu.**
   - Plan, sale, stoliki, kontury i skala krzeseł zapisane raz na poziomie restauracji. „Nowe wydarzenie z szablonu” kopiuje je do wydarzenia. „Zapisz układ jako szablon” działa z wydarzenia.
   - Sugestia: szablon jako wiersz `event` rodzaju `template` (bez gości i linków, ukryty na listach). Edytor `/sale` działa wtedy bez zmian, a kopiowanie robi jedna funkcja DB.
   - Przy tym wariancie trzeba jawnie zadbać, żeby:
     - `resolveAccess` odmawiał każdemu kluczowi szablonu (szablon ma klucze z DEFAULT/NOT NULL, ale nie wolno ich nigdzie pokazać);
     - listy, retencja, reset i liczniki pomijały szablony;
     - szablon edytował tylko personel lokalu przez sesję.
6. **S-13 `event-modules-branding`: moduły i branding.**
   - Włączniki per wydarzenie, ustawia je lokal: zgadywanie rachunku, pytania, tematy AI, zamówienia na telefonie gościa, „Pokaż na TV”.
   - Wyłączony moduł znika z UI, a jego API odpowiada 404.
   - Restauracja ma nazwę, logo (PNG, JPEG lub WebP, małe; bez SVG) i kolor akcentu na telefonach gości, TV, karteczkach i w panelu.
   - Nazwa produktu siedzi w jednej stałej i18n, a „Kolacja podwyżkowa” znika z layoutu i promptu AI.
   - Tematy AI są domyślnie wyłączone dla nowych wydarzeń (koszt ponosi platforma).
7. **S-14 `scale-150`: skala do 150 gości.**
   - Limity: 150 gości, ok. 60 stolików, do 30 miejsc przy długim stole prostokątnym (CHECK w DB i snapshotach).
   - TV per sala: wybór sali w adresie TV, przycięcie do konturu sali, czytelność według NFR-006.
   - Losowanie sprawdzone na 150 osobach z mierzonym budżetem.
   - Szacunek obciążenia odpytywania (150 telefonów co 2,5 s) i ewentualne wydłużenie interwału.
8. **S-15 `demo-restaurant`: dane i scenariusz na demo.**
   - `npm run demo` zakłada restaurację demo z kontem właściciela, szablonem sali (3 sale, ok. 15 stolików) i weselem na ok. 120 gości z grupami, opublikowanym rozkładem i zamówieniami.
   - Krótki scenariusz demo w README.

— granica realnych 8 h (dalej noc idzie, jeśli zdąży) —

9. **S-16 `guest-import-diets`: import gości i diety.**
   - Wklejenie z Excela (TSV) i plik CSV z podglądem mapowania kolumn: nazwa, grupa (ta sama etykieta = grupa), dieta, uwagi.
   - Dieta lub alergia przy gościu (lista + krótka uwaga) widoczna dla kuchni i obsługi przy miejscu oraz w zliczeniach.
   - Natywnego `.xlsx` nie ma, bo wymagałby zależności.
10. **S-17 `menu-catalog-courses`: katalog menu z kursami.** Dania i napoje lokalu z cenami i kursem (przystawka, zupa, danie główne, deser, napoje). Zamówienia wybierają z katalogu (wolny tekst nadal działa), a lista dla kuchni jest pogrupowana po kursach.
11. **S-18 `room-prints`: wydruki dla sali.** Tablica „znajdź swój stolik” (alfabetycznie, A3), numery i nazwy stołów, winietki, lista dla obsługi przy każdym stole (z dietami).
12. **S-19 `guest-rsvp-menu`: potwierdzenie obecności i wybór menu.**
    - Przed wydarzeniem gość na telefonie potwierdza obecność i wybiera danie z opcji, które lokal ustawił dla wydarzenia, do terminu.
    - Lokal widzi zliczenia.
13. **S-20 `privacy-retention`: prywatność i retencja.**
    - Dane gości usuwane N dni po dacie wydarzenia (ustawienie restauracji, domyślnie 30). Sprzątanie przy wejściu do panelu i komendą CLI, bez crona.
    - Eksport danych wydarzenia (CSV).
    - Strona z informacją o prywatności dla gości (administratorem jest restauracja), z linkiem na telefonie gościa.
14. **S-21 `landing-legal`: strona główna i szkice dokumentów.** Publiczna strona produktu z logowaniem i szkice regulaminu i polityki prywatności (oznaczone do przeglądu prawnika).

## Zaparkowane (M-3+, wymagają pieniędzy, świata zewnętrznego albo decyzji)

- Samodzielna rejestracja i e-maile (SES/Resend): weryfikacja e-maila, reset hasła mailem.
- Płatności i abonamenty (Stripe).
- Własna domena (CloudFront lub API Gateway, koszt), Supabase Pro (bez usypiania, backupy), monitoring i alarmy, śledzenie błędów (Sentry = zależność).
- Budżet AI per restauracja i własny klucz restauracji (BYOK).
- Dziennik działań personelu (audit log), 2FA.
- Kolejne kształty stołów (podkowa, kwadrat, owal, stół prezydialny).
- Ekran kuchni z czasem kursów (KDS), agenda wieczoru i pokaz slajdów na TV.
- Kalendarz wydarzeń i dane kontaktowe klienta (lekki CRM), statystyki lokalu.
- Kolejne języki (np. DE, UK), natywny import `.xlsx`, aplikacja PWA dla obsługi.

## Otwarte pytania do użytkownika (nie blokują nocy; w nawiasie domyślna odpowiedź dla nocy)

1. Nazwa produktu. (Nazwa robocza „Stolik” w jednej stałej i18n, łatwa do zmiany.)
2. Termin demo z restauracją. (Noc robi backlog po kolei, a każdy slice kończy się stanem gotowym do pokazania.)
3. Hosting platformy: nowy projekt Supabase (Free czy Pro), nowa funkcja Lambda czy obecna, własna domena. Kody QR drukują adres. (Noc niczego nie wdraża ani nie zakłada.)
4. Kto płaci za AI i jaki jest limit na restaurację miesięcznie. (Tematy AI domyślnie wyłączone w nowych wydarzeniach; limity per wydarzenie jak dziś; atrapa w testach.)
5. Teksty regulaminu i polityki prywatności (prawnik) oraz umowa powierzenia danych z restauracją. (Noc pisze tylko szkice oznaczone „do przeglądu prawnika”.)
6. Czy klient (link organizatora) może edytować sale i stoliki, czy tylko lokal. (Klient edytuje jak dziś; blokada układu przez lokal zaparkowana.)
