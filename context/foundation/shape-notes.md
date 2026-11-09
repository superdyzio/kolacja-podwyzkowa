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
  current_phase: 4.5
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
    - topic: zakres klienta (poprawka FR-027/028)
      decision: "klient prowadzi też zamówienia, ceny, napoje i rachunek; w trybie „lokal prowadzi” robi to menedżer; reset danych tylko dla lokalu; gry i zabawy (pytania, tematy AI, gra w zgadywanie, losowanie miejsc, pub quiz itp.) to opcjonalne moduły per wydarzenie; gra w zgadywanie i tematy AI domyślnie wyłączone"
    - topic: zakres i koszt
      decision: "cały backlog must-have, dostarczenie ok. 2 tygodnie; użytkownik świadomie przyjął koszt"
  frs_drafted: 49
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
| Klient (organizator) | link `/o/` od lokalu, bez logowania | jak organizator w v1 w obrębie swojego wydarzenia: goście, grupy, sale i stoliki, rozsadzenie, linki gości, karteczki, zamówienia z cenami, napoje, rachunek, gry i zabawy z włączonych modułów, „Pokaż na TV” | resetować danych, usuwać wydarzenia (tylko lokal) |
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

## Functional Requirements

Wszystkie nowe i zmienione FR mają priorytet must-have (decyzja użytkownika, zakres 2 tygodnie). FR-001..FR-020 pochodzą z PRD v1.

### Zachowane z v1 (w obrębie jednego wydarzenia; klient w roli organizatora)
- FR-001..FR-020: jak w PRD v1 (goście i grupy, nieobecni, przypięcia, plan i stoliki, ręczne sadzanie, TV, losowanie bez powtórek i publikacja, karteczki i linki gości, włącznik dostępu gości, widok miejsca gościa, pytania, tematy AI, strzały i ranking). Priority: must-have. Change: preserved. Wyjątki są opisane w FR-027, FR-031 i FR-033.

### Platforma, konta i zespół
- FR-021: Administrator platformy can założyć restaurację z jednorazowym linkiem zaproszenia dla właściciela, widzieć listę restauracji z licznikami, wyłączać i włączać restaurację oraz wejść w dane każdej restauracji (wsparcie). Priority: must-have. Change: new
- FR-022: Zaproszona osoba can ustawić hasło i logować się e-mailem i hasłem; sesja trwa 30 dni na urządzeniu; can się wylogować i zmienić hasło, co zamyka jej inne sesje. Priority: must-have. Change: new
- FR-023: Właściciel can zapraszać menedżerów i kelnerów, a menedżer kelnerów; obaj w swoim zakresie can zmieniać role, usuwać osoby z zespołu i generować jednorazowy link resetu hasła. Priority: must-have. Change: new

### Wydarzenia lokalu
- FR-024: Menedżer can utworzyć wydarzenie (nazwa, data, przewidywana liczba gości) od zera lub z szablonu sali, przeglądać wydarzenia nadchodzące, minione i archiwum oraz archiwizować i przywracać wydarzenia; właściciel can trwale usunąć wydarzenie. Priority: must-have. Change: new
- FR-025: Menedżer can skopiować linki wydarzenia (klient, TV, tablet obsługi) i wymienić każdy z nich na nowy. Priority: must-have. Change: modified (v1: wymiana tylko linku restauracji)
- FR-026: Menedżer can włączyć w wydarzeniu przełącznik „lokal prowadzi”, który daje personelowi edycję wszystkiego, co robi klient; bez niego personel ma podgląd. Priority: must-have. Change: new
- FR-027: Klient can przygotować i poprowadzić swoje wydarzenie jak organizator v1, łącznie z zamówieniami, napojami, cenami i rachunkiem, oraz korzystać z gier i zabaw włączonych w wydarzeniu; resetu danych nie ma. Priority: must-have. Change: modified
- FR-028: Menedżer can w trybie „lokal prowadzi” prowadzić zamówienia, napoje i rachunek za klienta; reset danych wydarzenia i koszty AI są dostępne tylko w panelu lokalu. Priority: must-have. Change: modified (v1: organizator)
- FR-029: Kelner can zobaczyć wydarzenia na dziś (plan z gośćmi, zamówienia z cenami, rachunek) i oznaczać wydane sztuki. Priority: must-have. Change: new

### Zasoby, wygląd i skala
- FR-030: Menedżer can zapisać układ sali (plan, sale, stoliki, rysunek) jako szablon lokalu, także z istniejącego wydarzenia, edytować szablon i tworzyć z niego wydarzenia; zmiana szablonu nie zmienia istniejących wydarzeń. Priority: must-have. Change: new
- FR-031: Gry i zabawy are opcjonalnymi modułami włączanymi per wydarzenie: pytania, tematy AI (domyślnie wyłączone), gra w zgadywanie rachunku (domyślnie wyłączona), losowanie miejsc, „Pokaż na TV”, pub quiz; wyłączony moduł znika u klienta, gości i na TV. Priority: must-have. Change: new
- FR-032: Właściciel can ustawić nazwę, logo i kolor lokalu widoczne na telefonach gości, TV, karteczkach i w panelu; wszędzie pojawia się nazwa produktu zamiast „Kolacja podwyżkowa”. Priority: must-have. Change: new / modified
- FR-033: Klient can prowadzić wydarzenie do 150 gości, ze stołami do 30 miejsc i ok. 60 stolikami. Priority: must-have. Change: modified (v1: 100 gości, 20 miejsc, 40 stolików)
- FR-034: Klient i lokal can otworzyć widok TV dla jednej sali. Priority: must-have. Change: new
- FR-048: Każdy, kto widzi pełną mapę sali (gość na telefonie, klient, personel, tablet obsługi), can wyszukać gościa po imieniu, a mapa podświetla jego miejsce. Priority: must-have. Change: new

### Funkcje restauracyjne
- FR-035: Klient (albo lokal w trybie „lokal prowadzi”) can zaimportować gości z pliku CSV lub wklejki z arkusza (nazwa, grupa, dieta, uwagi) z podglądem przed zapisem. Priority: must-have. Change: new
- FR-036: Klient can oznaczyć dietę lub alergię gościa, a kuchnia i kelnerzy can widzieć ją przy miejscu gościa i w zliczeniach. Priority: must-have. Change: new
- FR-037: Menedżer can prowadzić katalog dań i napojów lokalu z cenami i kursem (przystawka, zupa, danie główne, deser, napoje), z którego wybiera się pozycje zamówień; lista dla kuchni jest pogrupowana po kursach. Priority: must-have. Change: new
- FR-038: Klient i lokal can wydrukować tablicę „znajdź swój stolik”, karty stołów, winietki i listę dla obsługi przy stole (z dietami). Priority: must-have. Change: new
- FR-039: Gość can przed imprezą potwierdzić obecność i wybrać danie z opcji ustawionych dla wydarzenia, do terminu; klient i lokal can widzieć zliczenia. Priority: must-have. Change: new
- FR-040: Właściciel can ustawić, po ilu dniach od imprezy dane gości są usuwane (domyślnie 30); menedżer can wyeksportować dane wydarzenia; gość can przeczytać informację o prywatności. Priority: must-have. Change: new
- FR-049: Klient can przygotować pub quiz (np. o jubilacie) i poprowadzić go na TV, a goście odpowiadają na telefonach. Priority: must-have. Change: new

### Produkt
- FR-041: Odwiedzający can zobaczyć publiczną stronę produktu z logowaniem oraz szkice regulaminu i polityki prywatności. Priority: must-have. Change: new
- FR-042: Administrator platformy can przygotować restaurację demo z kontem, szablonem sali i przykładową imprezą firmową (goście, rozsadzenie, zamówienia). Priority: must-have. Change: new

### Zachowane po v1 (funkcje dodane po PRD v1)
- FR-043: Kuchnia i obsługa can widzieć na tablecie (`/r/`) plan z opublikowanym rozsadzeniem, listę do przygotowania i serwowanie per miejsce, tylko do odczytu. Priority: must-have. Change: preserved
- FR-044: Gość can oznaczać „Dotarło” przy swoich daniach i daniach na środek stołu. Priority: must-have. Change: preserved
- FR-045: Klient can pokazać na TV pytanie, temat AI albo wylosowaną osobę. Priority: must-have. Change: preserved
- FR-046: TV i telefon gościa can pokazać rysunek sali z imionami przy krzesłach, a klient can ułożyć ten rysunek w edytorze (także z propozycji AI ze zdjęcia planu). Priority: must-have. Change: preserved
- FR-047: Klient can bez sieci zobaczyć ostatni opublikowany rozkład i ranking strzałów. Priority: must-have. Change: preserved
