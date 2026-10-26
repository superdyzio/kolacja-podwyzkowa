---
project: kolacja-podwyzkowa
context_type: greenfield
created: 2026-10-25
updated: 2026-10-26
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7, 8]
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
    - topic: inseparable groups
      decision: "nierozdzielna grupa to 2–5 osób, domyślnie 2 (para)"
    - topic: repeated neighbours
      decision: "losowanie ma unikać powtórzenia sąsiadów z poprzednich rozkładów"
    - topic: key organizer wins
      decision: "przelosowanie, żeby ludzie się poznawali + szybkie sortowanie strzałów, żeby organizator mógł ogłaszać wyniki czytając od końca"
  frs_drafted: 14
  quality_check_status: warned
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
- `after_hours_only`: false (użytkownik ma czas także w dzień)

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
- Żadne losowanie nigdy nie rozdziela grupy (2–5 osób, domyślnie pary) oznaczonej jako nierozdzielna.
- Strzały kwot i posortowane wyniki nigdy nie pokazują się gościom ani na TV; widzi je tylko organizator.


## Functional Requirements

### Goście i pary
- FR-001: Organizator can dodać, edytować i usunąć gościa. Priority: must-have
  > Socrates: Counter-argument considered: "Lista gości jest stała, wystarczy import." Resolution: do ustalenia (wpisane do Open Questions).
- FR-002: Organizator can oznaczyć od dwóch do pięciu gości jako nierozdzielną grupę (domyślnie parę). Priority: must-have
  > Socrates: Counter-argument considered: "Nie tylko pary: trójki, rodzina z dzieckiem." Resolution: grupa nierozdzielna może mieć 2–5 osób, domyślnie 2.

### Sale i stoliki
- FR-003: Organizator can wgrać zrzut ekranu planu powierzchni z podziałem na pokoje. Priority: must-have
  > Socrates: Counter-argument considered: "Stoliki można narysować w apce bez zrzutu." Resolution: do ustalenia (wpisane do Open Questions).
- FR-004: Organizator can zdefiniować pokoje i stoliki (z liczbą miejsc) na wgranym planie. Priority: must-have
  > Socrates: Brak kontrargumentu; stoi jak napisano.
- FR-005: Organizator can ręcznie przypisać gościa do stolika. Priority: must-have
  > Socrates: Brak kontrargumentu; stoi jak napisano.
- FR-006: Organizator can wyświetlić na telewizorze układ sal z przypisanymi gośćmi. Priority: must-have
  > Socrates: Counter-argument considered: "40 nazwisk na jednym ekranie jest nieczytelne." Resolution: do ustalenia (wpisane do Open Questions).

### Rotacja
- FR-007: Organizator can wylosować nowy rozkład miejsc tak, żeby goście się przemieszali, nie powtarzali sąsiadów z poprzednich rozkładów, a oznaczone grupy zostały razem. Priority: must-have
  > Socrates: Counter-argument considered: "Czysta losowość może powtarzać sąsiadów." Resolution: losowanie ma unikać powtórzenia sąsiadów.

### Rozmowy
- FR-008: Organizator can dodać pytanie do bazy wraz z kategorią (kontrowersyjne / generyczne / refleksyjne). Priority: must-have
  > Socrates: Counter-argument considered: "Baza początkowa powinna być gotowa na starcie." Resolution: do ustalenia (wpisane do Open Questions).
- FR-009: Organizator lub gość can wylosować pytanie z bazy, wybierając kategorię lub dowolną; wylosowane pytanie widzi na swoim telefonie tylko ten, kto je wylosował. Priority: must-have
  > Socrates: Brak kontrargumentu; stoi jak napisano.
- FR-010: Organizator lub gość can wygenerować temat do rozmowy z pomocą AI. Priority: must-have
  > Socrates: Counter-argument considered: "Koszt i abuse: 40 gości może zalewać AI zapytaniami." Resolution: do ustalenia (wpisane do Open Questions).

### Strzały kwoty
- FR-011: Gość can z telefonu wpisać swój strzał finalnej kwoty podwyżki. Priority: must-have
  > Socrates: Counter-argument considered: "Gość może wpisać strzał za kogoś innego." Resolution: do ustalenia (wpisane do Open Questions).
- FR-012: Organizator can szybko wpisać strzał kwoty za gościa. Priority: must-have
  > Socrates: Brak kontrargumentu; stoi jak napisano.
- FR-013: Organizator can wpisać prawidłową kwotę i zobaczyć na własnym urządzeniu listę strzałów posortowaną wg odległości od niej, z możliwością czytania od ostatniego miejsca (remis = równe miejsce); wyniki nie są pokazywane gościom ani na TV. Priority: must-have
  > Socrates: Brak kontrargumentu; stoi jak napisano.

### Gość na telefonie
- FR-014: Gość can zobaczyć na telefonie swój stolik i miejsce. Priority: must-have
  > Socrates: Counter-argument considered: "Po przelosowaniu 40 telefonów musi się odświeżyć naraz." Resolution: do ustalenia (wpisane do Open Questions).

## Product Framing

- `product_type`: aplikacja webowa (widok organizatora, ekran na TV, widok gościa z telefonu przez link/QR)
- `target_scale.users`: ok. 40 gości jednocześnie + 1 organizator (jedno wydarzenie)

## Non-Goals

- Konta i logowanie gości (tylko link/QR i wybór z listy).
- Pokazywanie strzałów i wyników w apce lub na TV (czyta je na głos organizator).
- Obsługa wielu wydarzeń naraz i archiwum poprzednich edycji (jedna kolacja).
- Rysowanie planu sal w apce (plan to wgrany zrzut ekranu; FR-003).

## Business Logic

Apka losuje nowy rozkład miejsc tak, żeby goście nie siedzieli ponownie obok tych samych sąsiadów, a nierozdzielne grupy (2–5 osób, domyślnie pary) zawsze zostawały razem, i układa strzały kwot wg odległości od prawidłowej kwoty, tak by organizator mógł ogłaszać wyniki od ostatniego miejsca.

Unikanie powtórzeń sąsiadów jest preferencją, nie twardą regułą: gdy się nie da (mało miejsc, wiele rotacji), losowanie dopuszcza powtórki. Nierozdzielne grupy zostają razem zawsze.

## Non-Functional Requirements

- NFR-001: Akcja gościa na telefonie (wpisanie strzału, wylosowanie pytania, podgląd stolika) potwierdza się w ciągu 1 s na zwykłym wifi w lokalu.
- NFR-002: Apka obsługuje do 40 gości korzystających z telefonów jednocześnie, bez zauważalnego spowolnienia.
- NFR-003: Przy awarii wifi w lokalu organizator dalej może rozsadzać gości, losować rozkład i czytać ranking strzałów; bez sieci wypadają tylko funkcje gości i AI.
- NFR-004: Każdy gość ma limit wygenerowanych tematów AI na wieczór; organizator jest bez limitu. Wartość limitu do ustalenia.
- NFR-005: Widok gościa działa w zwykłej, aktualnej przeglądarce telefonu (iPhone/Safari, Android/Chrome), bez instalacji i konta.

## User Stories

> Szkic ze ścieżki flow podanej przez użytkownika; do potwierdzenia po rundzie Sokratesa.

### US-01: Organizator prowadzi całą kolację z jednej apki

- **Given** organizator, który wpisał gości, oznaczył pary i rozsadził ich na wgranym planie sal
- **When** wylosuje nowy rozkład, goście losują pytania i wpisują strzały kwoty na telefonach, a organizator wpisze prawidłową kwotę
- **Then** TV pokazuje układ sal, a organizator na własnym urządzeniu widzi strzały posortowane wg odległości od prawidłowej kwoty i czyta je na głos

#### Acceptance Criteria
- Po przelosowaniu żadna nierozdzielna grupa (para lub do 5 osób) nie jest rozdzielona.
- Strzały gości nie są widoczne dla innych gości ani na TV.
- Remis w odległości jest pokazany jako równe miejsce.

## Quality Cross-Check

Access Control, Business Logic, Non-Goals i Timeline Budget przeszły. Ostrzeżenia, które użytkownik zaakceptował:
- Secondary success criterion jest puste (kategorie weszły do MVP).
- Open Questions 1, 4, 6, 7 (wartość limitu AI i kontrola treści), 8 i 9 nie są rozstrzygnięte; żadne nie blokuje PRD.

## Open Questions

1. **FR-001: import listy gości?** — Socrates: lista gości jest stała, może wystarczy import. Owner: user.
2. ~~**FR-002: nierozdzielne grupy większe niż para?**~~ — Rozstrzygnięte: grupy 2–5 osób, domyślnie 2.
3. ~~**FR-003: wgrany zrzut vs. rysowanie planu w apce?**~~ — Rozstrzygnięte: wgrany zrzut; rysowanie planu w apce to Non-Goal.
4. **FR-006: czytelność 40 nazwisk na TV?** — Socrates: nieczytelne z kilku metrów. Owner: user.
5. ~~**FR-007: czy losowanie ma unikać powtórzenia sąsiadów z poprzedniego rozkładu?**~~ — Rozstrzygnięte: tak, unikać powtórzeń.
6. **FR-008: masowe wklejenie listy pytań do bazy na starcie?** — Socrates: baza początkowa gotowa na starcie. Owner: user.
7. **FR-010: limity zapytań do AI i kontrola treści?** — Częściowo rozstrzygnięte (NFR-004): limit na gościa, organizator bez limitu. Do ustalenia: wartość limitu i kontrola treści. Owner: user.
8. **FR-011: ochrona przed wpisaniem strzału za kogoś innego?** — Socrates: bez kont tylko wybór z listy chroni tożsamość. Owner: user.
9. **FR-014: odświeżanie telefonów po przelosowaniu?** — Socrates: wymaga aktualizacji na żywo u wszystkich. Owner: user.
