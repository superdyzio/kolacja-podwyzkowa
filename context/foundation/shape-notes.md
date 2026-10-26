---
project: null
context_type: greenfield
created: 2026-10-25
updated: 2026-10-25
checkpoint:
  current_phase: 4.5
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
      decision: "wyniki NIE są odsłaniane w aplikacji ani na TV; posortowane wyniki widzi tylko organizator na własnym telefonie/laptopie i czyta je na głos"
    - topic: question flow
      decision: "każdy (organizator i gość) losuje własne pytanie na telefonie, bez synchronizacji z TV; gość losuje z bazy, generuje temat z AI i wybiera kategorię; dodawanie pytań do bazy tylko organizator"
    - topic: proxy guess entry
      decision: "zostaje: organizator może wpisać strzał za gościa"
    - topic: ties
      decision: "remis w odległości = równe miejsce, oznaczone jako remis"
  frs_drafted: 14
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
- (brak) Kategorie i filtrowanie pytań, pierwotnie nice-to-have, weszły do MVP jako uprawnienie gościa (FR-009). Do uzupełnienia w cross-checku, jeśli pojawi się inny nice-to-have.

### Guardrails
- Odświeżenie strony ani restart urządzenia nie kasuje gości, par ani rozsadzenia.
- Apka działa na słabym wifi w lokalu (awaria sieci nie blokuje prowadzenia wieczoru).
- Żadne losowanie nigdy nie rozdziela pary oznaczonej jako nierozdzielna.
- Strzały kwot i posortowane wyniki nigdy nie pokazują się gościom ani na TV; widzi je tylko organizator.


## Functional Requirements

### Goście i pary
- FR-001: Organizator can dodać, edytować i usunąć gościa. Priority: must-have
- FR-002: Organizator can oznaczyć dwóch gości jako nierozdzielną parę. Priority: must-have

### Sale i stoliki
- FR-003: Organizator can wgrać zrzut ekranu planu powierzchni z podziałem na pokoje. Priority: must-have
- FR-004: Organizator can zdefiniować pokoje i stoliki (z liczbą miejsc) na wgranym planie. Priority: must-have
- FR-005: Organizator can ręcznie przypisać gościa do stolika. Priority: must-have
- FR-006: Organizator can wyświetlić na telewizorze układ sal z przypisanymi gośćmi. Priority: must-have

### Rotacja
- FR-007: Organizator can wylosować nowy rozkład miejsc tak, żeby goście się przemieszali, a oznaczone pary zostały razem. Priority: must-have

### Rozmowy
- FR-008: Organizator can dodać pytanie do bazy wraz z kategorią (kontrowersyjne / generyczne / refleksyjne). Priority: must-have
- FR-009: Organizator lub gość can wylosować pytanie z bazy, wybierając kategorię lub dowolną; wylosowane pytanie widzi na swoim telefonie tylko ten, kto je wylosował. Priority: must-have
- FR-010: Organizator lub gość can wygenerować temat do rozmowy z pomocą AI. Priority: must-have

### Strzały kwoty
- FR-011: Gość can z telefonu wpisać swój strzał finalnej kwoty podwyżki. Priority: must-have
- FR-012: Organizator can szybko wpisać strzał kwoty za gościa. Priority: must-have
- FR-013: Organizator can wpisać prawidłową kwotę i zobaczyć na własnym urządzeniu listę strzałów posortowaną wg odległości od niej (remis = równe miejsce); wyniki nie są pokazywane gościom ani na TV. Priority: must-have

### Gość na telefonie
- FR-014: Gość can zobaczyć na telefonie swój stolik i miejsce. Priority: must-have

## User Stories

> Szkic ze ścieżki flow podanej przez użytkownika; do potwierdzenia po rundzie Sokratesa.

### US-01: Organizator prowadzi całą kolację z jednej apki

- **Given** organizator, który wpisał gości, oznaczył pary i rozsadził ich na wgranym planie sal
- **When** wylosuje nowy rozkład, goście losują pytania i wpisują strzały kwoty na telefonach, a organizator wpisze prawidłową kwotę
- **Then** TV pokazuje układ sal, a organizator na własnym urządzeniu widzi strzały posortowane wg odległości od prawidłowej kwoty i czyta je na głos

#### Acceptance Criteria
- Po przelosowaniu żadna para nie jest rozdzielona.
- Strzały gości nie są widoczne dla innych gości ani na TV.
- Remis w odległości jest pokazany jako równe miejsce.
