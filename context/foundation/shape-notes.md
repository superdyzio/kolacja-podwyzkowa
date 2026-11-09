---
project: kolacja-podwyzkowa
context_type: brownfield
created: 2026-11-09
updated: 2026-11-09
timeline_budget:
  delivery_weeks: 2
  hard_deadline: null
  after_hours_only: false
checkpoint:
  current_phase: 4
  phases_completed: [1, 2, 3]
  gray_areas_resolved:
    - topic: context type
      decision: "brownfield (171 commitów, package-lock.json, src/, .github/); v1 shape-notes zarchiwizowane w context/foundation/archive/shape-notes-2026-11-09-1534.md"
    - topic: model produktu
      decision: "platforma SaaS dla wielu restauracji; dane restauracji odizolowane"
    - topic: onboarding restauracji
      decision: "restauracje zakłada administrator platformy (użytkownik) i daje właścicielowi link zaproszenia; samodzielna rejestracja i płatności później"
    - topic: logowanie personelu
      decision: "własne konta e-mail + hasło, bez wysyłania e-maili; zaproszenia i reset hasła jako jednorazowe linki do skopiowania"
    - topic: kto prowadzi wydarzenie
      decision: "lokal tworzy wydarzenie (z szablonu sali) i daje klientowi link organizatora; zamówienia, ceny, rachunek, koszty AI, moduły i usuwanie widzi tylko lokal"
    - topic: skala
      decision: "do 150 gości na wydarzenie"
    - topic: dane produkcyjne
      decision: "nowy projekt bazy dla platformy; stara baza zostaje archiwum kolacji 2026-11-08"
    - topic: zakres nocy
      decision: "pełny backlog (rdzeń + szablony sal, moduły i branding, import gości z dietami, wydruki + inne sensowne pomysły); noc implementuje po kolei tyle, ile zdąży przed demo z restauracją"
    - topic: change category
      decision: "zmiana architektoniczna (wiele restauracji i wydarzeń, konta) + nowe moduły dla lokalu"
    - topic: wgląd (co zachwyciło restaurację)
      decision: "zamówienia i serwowanie (kto co zamówił i gdzie siedzi) oraz rozsadzenie na planie z TV"
    - topic: status quo restauracji
      decision: "ustalenia z klientem mailem/telefonem + Excel/Word i wydruki"
    - topic: persona główna
      decision: "koordynator imprez lokalu"
    - topic: typowe imprezy
      decision: "imprezy firmowe i wigilie oraz rodzinne (komunie, urodziny); nie wesela"
    - topic: role personelu
      decision: "właściciel + menedżer + kelner; kelner widzi ceny i rachunek; menedżer zarządza kelnerami; właściciel także menedżerami, ustawieniami lokalu i usuwaniem"
    - topic: wgląd administratora platformy
      decision: "pełny wgląd w dane każdej restauracji (wsparcie)"
    - topic: personel a praca klienta
      decision: "domyślnie podgląd; per wydarzenie przełącznik „lokal prowadzi” daje personelowi edycję tego, co robi klient"
    - topic: długość sesji
      decision: "30 dni na urządzeniu; wylogowanie i zmiana hasła zamykają sesje"
    - topic: linki bez logowania
      decision: "linki lokalu (/r/, TV) tylko do odczytu; każda zmiana po stronie lokalu wymaga konta; link klienta (/o/) i linki gości (/g/) zachowują swoje dotychczasowe akcje"
    - topic: przepływ demo (MVP zmiany)
      decision: "przepływ 1–7: administrator zakłada lokal → zespół → szablon sali → wydarzenie z szablonu i link dla klienta → klient rozsadza → zamówienia, TV, kelner, tablet → archiwum i kolejne wydarzenie z szablonu"
    - topic: zakres i koszt
      decision: "cały backlog must-have, dostarczenie ok. 2 tygodnie; użytkownik świadomie przyjął koszt"
  frs_drafted: 0
  quality_check_status: pending
---

# Shape notes — M-2: platforma dla restauracji

Źródła: decyzje z sesji 2026-11-09 („product”) zapisane w `context/foundation/m2-product-notes.md` (backlog, zaparkowane, uwagi projektowe) oraz ta rozmowa. PRD v1 (jedna kolacja): `context/foundation/prd.md`.

## Current System

- **Co istnieje:** aplikacja webowa „kolacja-podwyzkowa”, zbudowana na jedną kolację (10. edycja kolacji podwyżkowej, 2026-11-08, 36 gości, 4 stoły). Jedno wydarzenie na wdrożenie.
- **Widoki:** organizator (`/o/<klucz>`), TV (`/tv/<klucz>`), gość (`/g/<klucz>`, karteczka z QR) i obsługa restauracji (`/r/<klucz>`). Każdy otwiera się wyłącznie przez niezgadywalny klucz w linku, bez kont.
- **Funkcje:** goście i grupy; plan sali z rysunkiem stołów; ręczne rozsadzanie i losowanie bez powtórek sąsiadów; publikacja na TV i telefony w ≤ 5 s; zamówienia z widokiem dla kuchni i obsługi, serwowanie per miejsce, goście oznaczają „Dotarło”; napoje do rachunku; gra w zgadywanie rachunku z rankingiem; baza pytań i tematy AI z limitami; „Pokaż na TV”; odczyt bez sieci u organizatora; reset danych; PL/EN.
- **Stack:** Astro 7 SSR, React 19, Tailwind 4, Postgres (Supabase, dostęp tylko z serwera), AWS Lambda z Function URL, Claude przez Anthropic API (domyślnie atrapa).
- **Użytkownicy dziś:** jeden organizator (użytkownik), ok. 36–40 gości z telefonami, jeden TV, obsługa restauracji z linkiem `/r/` (użyte na kolacji 2026-11-08).

## Vision & Problem Statement

Restauracja, w której odbyła się kolacja 2026-11-08, była zachwycona dwiema rzeczami:
- **zamówieniami i serwowaniem:** kuchnia i kelnerzy widzieli, kto co zamówił i gdzie siedzi;
- **rozsadzeniem na planie z TV.**

Lokal często robi duże imprezy: firmowe i wigilie oraz rodzinne (komunie, urodziny). Chce tego narzędzia do własnego użytku. Dziś ustala wszystko z klientem mailem i telefonem, a listy gości i plany stołów prowadzi w Excelu i Wordzie i drukuje.

Luka: aplikacja obsługuje jedną kolację na wdrożenie, nie ma kont, panelu lokalu ani zasobów lokalu do ponownego użycia, a treści są wpisane pod „kolację podwyżkową”. Zmiana robi z niej platformę dla wielu restauracji. Lokal zakłada wydarzenia, przekazuje klientowi link do rozsadzenia gości i prowadzi zamówienia i obsługę w dniu imprezy. Wszystko, co działało na kolacji, zostaje.

## User & Persona

**Primary: koordynator imprez lokalu.** Pracownik restauracji. Zakłada wydarzenia, uzgadnia je z klientem i prowadzi obsługę w dniu imprezy (zamówienia, serwowanie, TV). Dziś pracuje na mailach, telefonie, Excelu i wydrukach.

### Secondary persona

- **Klient zamawiający imprezę** (firma, rodzina). Dostaje od lokalu link organizatora, wpisuje gości, tworzy grupy, rozsadza i prowadzi atrakcje wieczoru, tak jak organizator kolacji w v1.
- **Właściciel lokalu.** Zarządza zespołem i całą restauracją.
- **Administrator platformy (użytkownik).** Zakłada restauracje i zaprasza ich właścicieli.
- **Goście imprezy:** bez zmian względem v1, w obrębie swojego wydarzenia.

## Access Control

**Obecny model (v1):** bez kont. Każdy widok otwiera się wyłącznie przez niezgadywalny klucz w linku: organizator `/o/`, TV `/tv/`, gość `/g/` (osobisty, z włącznikiem dostępu gości i unieważnianiem), obsługa restauracji `/r/` (tylko odczyt). Nieważny klucz daje tę samą odmowę bez danych.

**Zmiana:** dochodzą konta personelu i administratora platformy. Linki zostają dla klienta, TV, gości i tabletu obsługi, każdy w obrębie jednego wydarzenia.

| Rola | Jak wchodzi | Może | Nie może |
|---|---|---|---|
| Administrator platformy | konto | zakładać restauracje, zapraszać właścicieli, wyłączać restauracje; pełny wgląd w dane każdej restauracji (wsparcie) | — |
| Właściciel lokalu | konto (zaproszenie od administratora platformy) | wszystko w swojej restauracji: wydarzenia, szablony sal, menu, zamówienia, ceny, rachunek, linki, moduły, archiwum; zespół (menedżerowie i kelnerzy); ustawienia lokalu (branding); usuwanie | widzieć inne restauracje |
| Menedżer | konto (zaproszenie od właściciela) | wydarzenia, szablony sal, menu, zamówienia, ceny, rachunek, linki, moduły, archiwum; zaprasza i usuwa kelnerów | zarządzać menedżerami i właścicielem, zmieniać ustawienia lokalu, usuwać restaurację |
| Kelner | konto (zaproszenie od właściciela lub menedżera) | wydarzenia na dziś: plan z gośćmi, zamówienia z cenami i rachunkiem, oznaczanie wydanych | widzieć i wydawać linki, zmieniać wydarzenia, zespół, ustawienia |
| Klient (organizator) | link `/o/` od lokalu, bez logowania | jak organizator w v1 w obrębie swojego wydarzenia: goście, grupy, sale i stoliki, rozsadzenie, linki gości, karteczki, pytania, gra, „Pokaż na TV” | widzieć zamówienia, ceny, napoje, rachunek, koszty AI, moduły; usuwać wydarzenie |
| TV | link `/tv/`, bez logowania | tylko odczyt, jak w v1 | cokolwiek zmieniać |
| Tablet obsługi | link `/r/`, bez logowania | tylko odczyt, jak w v1 (plan, zamówienia do wydania) | cokolwiek zmieniać; oznaczanie wydanych wymaga konta kelnera |
| Gość | osobisty link `/g/`, bez logowania | jak w v1, tylko własne dane: miejsce, strzał, „Dotarło”, pytania, tematy AI | widzieć dane innych poza opublikowanym rozsadzeniem |

Zasady:
- **Linki lokalu są tylko do odczytu.** Każda zmiana po stronie lokalu (`/r/`, TV) wymaga zalogowania. Link klienta i linki gości zachowują swoje akcje z v1.
- **Personel a praca klienta.** Domyślnie personel lokalu tylko podgląda to, co robi klient (goście, grupy, rozsadzenie). Przełącznik „lokal prowadzi” w wydarzeniu daje personelowi edycję za klienta, na przykład gdy klient przysyła listę mailem albo prosi o przesadzenie przez telefon.
- **Sesja** trwa 30 dni na urządzeniu. Wylogowanie i zmiana hasła ją zamykają.
- **Konta bez e-maili.** Zaproszenia i reset hasła to jednorazowe linki z terminem ważności, które przekazuje zapraszający.
- **Odmowa.** Wejście do panelu bez zalogowania prowadzi do logowania. Cudze lub nieznane wydarzenie albo restauracja daje tę samą odmowę bez danych, jak dziś dla kluczy.

## Change flow (MVP zmiany)

Przepływ, który ma zadziałać na demo z restauracją (delta względem v1):

1. Administrator platformy zakłada restaurację i daje właścicielowi link zaproszenia.
2. Właściciel ustawia hasło i zaprasza menedżera i kelnera.
3. Menedżer raz wprowadza szablon sali (plan, sale, stoły).
4. Menedżer tworzy wydarzenie (np. „Wigilia firmy Y, 12.12, 80 osób”) z szablonu i kopiuje klientowi link organizatora.
5. Klient wkleja gości, rozsadza i publikuje (jak v1). Lokal widzi to w podglądzie.
6. Menedżer wpisuje zamówienia. W dniu imprezy TV pokazuje rozsadzenie, kelner na swoim koncie oznacza wydane, a kuchnia patrzy na tablet `/r/`.
7. Po imprezie wydarzenie idzie do archiwum, a następne powstaje z tego samego szablonu w minutę.

**Zasięg zmiany:**
- Każdy serwis i każda funkcja bazy dostają wydarzenie zamiast stałego `id = 1`.
- Zmieniają się też middleware dostępu, smoke i dane demo.
- Użytkownik pierwszy zauważyłby wyciek danych między wydarzeniami albo restauracjami.

## Success Criteria

### Primary
- Przepływ 1–7 przechodzi na żywo na demo wyłącznie w aplikacji, bez komend i ręcznych zmian w bazie (poza pierwszym kontem administratora platformy).
- Od „Nowe wydarzenie” z szablonu do skopiowanego linku dla klienta mijają mniej niż 3 minuty.
- Restauracja prowadzi w aplikacji swoją pierwszą prawdziwą imprezę, bez Excela w dniu imprezy.

### Secondary
- Po demo restauracja deklaruje użycie na kolejnych imprezach i gotowość do płacenia.
- Druga restauracja działa na platformie bez zmian w kodzie.
- W dniu imprezy kuchnia i kelnerzy nie używają wydrukowanej listy zamówień.
- Klient przygotowuje gości i rozsadzenie bez pomocy lokalu.

### Guardrails
- **Izolacja danych:** żadna osoba ani link nie zobaczy danych innej restauracji ani innego wydarzenia (wyjątek: wgląd administratora platformy).
- **v1 bez regresji:** prywatność strzałów, publikacja na TV i telefony w ≤ 5 s, odczyt bez sieci, karteczki QR i PL/EN działają jak na kolacji 2026-11-08.
- **Linki lokalu tylko do odczytu:** żadna zmiana po stronie lokalu bez zalogowania; dane gości nigdy nie trafiają do AI.
- **Utrata hasła nie blokuje lokalu:** zawsze jest droga odzyskania dostępu (link resetu od właściciela lub menedżera albo od administratora platformy), bez ręcznych zmian w bazie.

## Timeline acknowledgment

Acknowledged on 2026-11-09: 2-week delivery of the full M-2 backlog (all must-have) requires sustained dedication; user accepted.
