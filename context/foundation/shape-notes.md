---
project: null
context_type: greenfield
created: 2026-10-25
updated: 2026-10-25
checkpoint:
  current_phase: 4
  phases_completed: [1, 2, 3]
  gray_areas_resolved:
    - topic: context type
      decision: "greenfield (git history only: initial commit + context/ scaffold; no code, manifests or lockfiles)"
    - topic: pain category
      decision: "rozproszone narzędzia + brak możliwości (rotacja z parami, ranking zgadywania) + obciążenie organizatora na żywo"
    - topic: insight
      decision: "wszystko w jednym widoku, z którego organizator steruje całym wieczorem"
    - topic: guest role
      decision: "goście wchodzą w interakcję z telefonów (scope do doprecyzowania w fazie 3 — rekomendacja skilla na MVP to goście tylko oglądają TV)"
    - topic: access model
      decision: "organizator bez logowania; goście przez QR/link bez konta; dwie role (organizator, gość)"
    - topic: MVP scope
      decision: "MVP = finalny produkt na kolację 2026-11-08; w MVP także interakcja gości z telefonów (strzał kwoty, własny stolik, aktualne pytanie)"
    - topic: guess visibility
      decision: "strzały kwot ukryte do momentu odsłonięcia wyników przez organizatora"
  frs_drafted: 0
  quality_check_status: pending
---

# Shape notes

## Seed idea

> Apka na kolację podwyżkową: wyświetlanie układu sal, przypisanych stolików, losowanie nowego rozkładu żeby przerotować ludzi zachowując pary razem, generowanie losowych pytań do rozmowy (kontrowersyjne / generyczne / refleksyjne), opcja szybkiego wprowadzenia odpowiedzi każdego człowieka na pytanie o finalną kwotę (podwyżki), sortowanie wg odległości od prawidłowej odpowiedzi.

## Vision & Problem Statement

Organizator (jedna osoba) przygotowuje i prowadzi raz w roku kolację dla 40 przyjaciół; to 10. edycja, goście zawsze mają 25+, w tym roku 35+. Logistykę wydarzenia (rozsadzenie, atrakcje) trzyma dziś w kilku Excelach i na kartkach. Kosztuje go to czas i stres, zarówno w przygotowaniach, jak i w trakcie samej kolacji.

Wgląd: wszystko, czym organizator steruje podczas wieczoru, ma być w jednym widoku, który wyświetla się na telewizorze w sali. Reguły, których zwykły Excel nie obsługuje sam (rotacja gości z zachowaniem par, ranking zgadywania kwoty), mają być wbudowane w to narzędzie.

Pain category (user-confirmed): rozproszone narzędzia, brak możliwości (rotacja z parami, ranking zgadywania), obciążenie organizatora na żywo.

> Open: "w trakcie kolacji i logistyki dookoła" to dwa momenty — przygotowania przed wydarzeniem i obsługa na żywo. Do rozdzielenia w fazie 4 (FR).

## User & Persona

**Primary: organizator wydarzenia.** Jedna osoba, sam przygotowuje i prowadzi kolację dla 40 przyjaciół (10. edycja, raz w roku). Obsługuje całość sam, a swój widok wyświetla na telewizorze w sali.

### Secondary persona

**Goście** (ok. 40, w tym roku 35+): widzą jeden ekran wyświetlany na TV. Według deklaracji użytkownika część funkcji może trafić do nich do użycia z telefonów (zakres do doprecyzowania w fazie 3).

## Access Control

Dwie role, bez kont użytkowników:

- **Organizator** — wchodzi bez logowania, widok organizatora na własnym urządzeniu. Pełne uprawnienia (cały wieczór).
- **Gość** — wchodzi z telefonu przez skan kodu QR lub link, bez zakładania konta. Uprawnienia ograniczone (które dokładnie funkcje — faza 3 i 4).

> Open: ekran na TV jest widokiem tylko do odczytu, sterowanym przez organizatora (do potwierdzenia w fazie 4). Brak kont oznacza, że tożsamość gościa to wybór z listy; wpływ na możliwość podszywania się nie był omawiany.

## Timeline Budget

- `mvp_weeks`: 2 (MVP = finalny produkt; ok. 14 dni od 2026-10-25)
- `hard_deadline`: 2026-11-08 (kolacja)
- `after_hours_only`: do ustalenia w fazie 6

Zakres flow przekracza typowe 6 akcji i obejmuje integrację z AI, ale termin (2 tygodnie) mieści się w progu 3 tygodni; użytkownik wprost uznał zakres za wykonalny w tym czasie.

## Success Criteria

Flow MVP według użytkownika (kolejność kroków): wpisanie gości → wrzucenie zrzutu ekranu powierzchni z podziałem na pokoje → rozsadzenie gości → oznaczenie nierozdzielnych par → przelosowania miejsc → generowanie tematów do rozmowy (AI + wprowadzona baza pytań) → goście wpisują swoje strzały kwoty → organizator odczytuje posortowane wyniki.

### Primary
- Cała kolacja 2026-11-08 (rozsadzenie, rotacje, pytania, ranking strzałów) jest przeprowadzona z jednej apki, bez wracania do Excela i kartek.

### Secondary
- Kategorie i filtrowanie pytań: wybór poziomu (kontrowersyjne / generyczne / refleksyjne) dla danej rundy rozmów.

### Guardrails
- Odświeżenie strony ani restart urządzenia nie kasuje gości, par ani rozsadzenia.
- Apka działa na słabym wifi w lokalu (awaria sieci nie blokuje prowadzenia wieczoru).
- Żadne losowanie nigdy nie rozdziela pary oznaczonej jako nierozdzielna.

> Open: "Kategorie" pytań (kontrowersyjne / generyczne / refleksyjne) są w seed idea, a jako nice-to-have wybrano "kategorie i filtrowanie". Do rozstrzygnięcia w fazie 4: kategoria jako atrybut każdego pytania (must-have) vs filtrowanie rundy po kategorii (nice-to-have).
