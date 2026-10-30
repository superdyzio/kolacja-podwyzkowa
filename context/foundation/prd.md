---
project: kolacja-podwyzkowa
version: 1
status: draft
created: 2026-10-26
context_type: greenfield
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 2
  hard_deadline: 2026-11-08
  after_hours_only: false
---

# kolacja-podwyzkowa — PRD

## Vision & Problem Statement

Organizator (jedna osoba) co roku przygotowuje i prowadzi kolację podwyżkową dla przyjaciół. To 10. edycja; co roku przychodzi ponad 25 osób, w tym roku ponad 35 (do ok. 40). Rozsadzenie i przebieg wieczoru trzyma dziś w kilku arkuszach kalkulacyjnych i na kartkach. Kosztuje go to czas i stres, zarówno w przygotowaniach, jak i w trakcie samej kolacji.

Wgląd: wieczór ma jeden wspólny stan i trzy widoki. Organizator steruje wszystkim z własnego urządzenia, telewizor w sali pokazuje tylko rozsadzenie na planie, a goście na swoich telefonach widzą swoje miejsce, losują pytania i oddają strzały. Reguły, których arkusz sam nie obsłuży (rotacja bez powtarzania sąsiadów z zachowaniem nierozdzielnych grup, ranking strzałów czytany od końca), są wbudowane w narzędzie.

## User & Persona

**Primary: organizator wydarzenia (użytkownik).** Sam przygotowuje i prowadzi kolację (10. edycja, raz w roku, 35–40 gości w 2–3 salach). Sięga po apkę w dwóch momentach: przed kolacją (wpisanie gości, plan sal, grupy, pierwsze rozsadzenie, wydruk karteczek z QR) i w trakcie (przelosowania, pytania, zbieranie strzałów, odczyt wyników). Sam też siedzi przy stole i rotuje jak goście, więc obsługa musi być szybka z telefonu lub laptopa.

Flow wieczoru według użytkownika: wpisanie gości → wgranie zrzutu powierzchni z podziałem na pokoje → rozsadzenie → oznaczenie nierozdzielnych grup → przelosowania miejsc → tematy do rozmowy (baza pytań + AI) → goście wpisują strzały kwoty → organizator odczytuje posortowane wyniki.

### Secondary persona

**Gość** (35–40 osób): dostaje karteczkę z osobistym kodem QR lub link, otwiera go na swoim telefonie bez instalacji i konta. Widzi swój stolik i miejsce, losuje pytania, generuje tematy AI i oddaje strzał kwoty. Rozsadzenie na planie widzi też na TV w sali.

## Success Criteria

### Primary
- Cała kolacja 2026-11-08 (rozsadzenie, 1–2 przelosowania, pytania, strzały, odczyt wyników) przechodzi w apce, bez powrotu do arkuszy i kartek w trakcie wieczoru.
- Od zamknięcia przyjmowania strzałów i wpisania prawidłowej kwoty do odczytania pierwszego wyniku od końca mija mniej niż 1 minuta.

### Secondary
- Po każdym przelosowaniu goście siedzą obok nowych osób: przy 35–40 gościach i 1–2 przelosowaniach żadna para sąsiadów się nie powtarza (nie licząc członków tej samej grupy).

### Guardrails
- Odświeżenie strony, zamknięcie przeglądarki ani restart urządzenia nie kasuje gości, grup, planu, stolików, rozkładów i ich historii, strzałów, prawidłowej kwoty ani bazy pytań.
- Żadne losowanie nie rozdziela nierozdzielnej grupy (2–5 osób, domyślnie para).
- Strzały innych gości i ranking nigdy nie są widoczne dla gości ani na TV; gość widzi tylko własny strzał, ranking widzi tylko organizator.
- Bez osobistego linku gościa, adresu TV albo sekretnego linku organizatora nikt nie zobaczy listy gości, rozsadzenia ani nie odda strzału.
- Awaria sieci w lokalu nie odbiera organizatorowi wglądu w ostatni rozkład ani w ranking zebranych strzałów.

## User Stories

### US-01: Organizator przygotowuje kolację

- **Given** organizator z listą gości i zrzutem planu lokalu
- **When** wkleja listę gości, wgrywa plan, stawia pinezki stolików z liczbą miejsc i typem, oznacza grupy i rozsadza gości
- **Then** TV pokazuje imiona gości przy stolikach na planie, a organizator drukuje karteczki z osobistymi kodami QR

#### Acceptance Criteria
- Wklejenie 40 linii tworzy 40 gości z wyświetlaną nazwą; każdego można potem edytować lub usunąć.
- Grupę 2–5 osób da się utworzyć i rozwiązać; członkowie grupy siedzą przy jednym stoliku na sąsiednich miejscach.
- Każdy stolik ma pozycję na planie, liczbę miejsc i typ (okrągły/prostokątny).
- Strona karteczek ma dla każdego gościa wyświetlaną nazwę i działający osobisty kod QR.

### US-02: Organizator przelosowuje rozkład

- **Given** opublikowany rozkład, grupy, stałe miejsca i oznaczeni nieobecni
- **When** organizator losuje projekt nowego rozkładu, przegląda go, ewentualnie losuje ponownie lub zamienia osoby ręcznie, i publikuje
- **Then** TV i telefony gości pokazują nowy rozkład w ciągu 5 s, bez żadnej akcji gości

#### Acceptance Criteria
- Żadna nierozdzielna grupa nie zostaje rozdzielona.
- Przypięci goście zostają na swoich miejscach; nieobecni nie dostają miejsca.
- Przy 35–40 gościach i 1–2 przelosowaniach żadna para sąsiadów (obok; przy stoliku prostokątnym także naprzeciwko) się nie powtarza, nie licząc członków tej samej grupy.
- Gdy rozkładu nie da się ułożyć (grupa większa niż wolne sąsiednie miejsca przy każdym stoliku, więcej obecnych gości niż miejsc), organizator dostaje komunikat wskazujący przyczynę, a opublikowany rozkład się nie zmienia.
- Projekt, którego organizator nie opublikował, nie trafia na TV ani na telefony; po publikacji można wrócić do poprzedniego rozkładu.

### US-03: Gość korzysta z telefonu

- **Given** gość z osobistym linkiem lub kodem QR, przy włączonym dostępie gości
- **When** otwiera link na telefonie
- **Then** widzi swoją nazwę, stolik i miejsce, może wylosować pytanie z bazy i wygenerować temat AI w wybranej kategorii

#### Acceptance Criteria
- Wylosowane pytanie i temat AI widzi tylko gość, który je wylosował.
- Szósta próba wygenerowania tematu AI przez tego samego gościa jest odrzucona z czytelnym komunikatem; nieudana próba nie zmniejsza limitu.
- Przy wyłączonym dostępie gości albo unieważnionym linku gość widzi komunikat o braku dostępu i żadnych danych.

### US-04: Strzały i odczyt wyników

- **Given** goście z osobistymi linkami i organizator z sekretnym linkiem
- **When** goście wpisują i poprawiają strzały, organizator wpisuje strzały za tych, którzy nie mogą, zamyka przyjmowanie i wpisuje prawidłową kwotę
- **Then** organizator na swoim urządzeniu widzi ranking wg odległości od prawidłowej kwoty i czyta go od ostatniego miejsca

#### Acceptance Criteria
- Gość widzi tylko własny strzał; po zamknięciu przyjmowania nie może go zmienić.
- Organizator widzi listę gości, którzy jeszcze nie oddali strzału.
- Remis w odległości daje równe miejsce i jest oznaczony jako remis.
- Ranking ani strzały innych nie pojawiają się na TV ani na telefonach gości.

## Functional Requirements

### Goście i grupy
- FR-001: Organizator can wkleić listę gości (jedna osoba na linię) oraz dodać, edytować i usunąć pojedynczego gościa z wyświetlaną nazwą (imię lub ksywka). Priority: must-have
  > Socratic: Counter-argument considered: "Lista gości jest stała, wystarczy import." Resolution: wklejenie listy + edycja pojedyncza; wyświetlana nazwa zamiast pełnego nazwiska.
- FR-002: Organizator can oznaczyć od dwóch do pięciu gości jako nierozdzielną grupę (domyślnie parę) i rozwiązać grupę. Priority: must-have
  > Socratic: Counter-argument considered: "Nie tylko pary: trójki, rodzina z dzieckiem." Resolution: grupa nierozdzielna może mieć 2–5 osób, domyślnie 2.
- FR-003: Organizator can oznaczyć gościa jako nieobecnego i z powrotem jako obecnego. Priority: must-have
- FR-004: Organizator can przypiąć gościa (także siebie) do konkretnego miejsca i odpiąć go. Priority: must-have

### Sale i stoliki
- FR-005: Organizator can wgrać zrzut ekranu planu powierzchni i nazwać sale. Priority: must-have
  > Socratic: Counter-argument considered: "Stoliki można narysować w apce bez zrzutu." Resolution: wgrany zrzut zostaje; rysowanie planu w apce to Non-Goal.
- FR-006: Organizator can dodać, edytować i usunąć stolik w sali z nazwą, liczbą miejsc, typem (okrągły / prostokątny) i pozycją zaznaczoną na wgranym planie. Priority: must-have
- FR-007: Organizator can ręcznie posadzić gościa na konkretnym miejscu lub zamienić miejscami dwóch gości. Priority: must-have
- FR-008: Organizator can otworzyć na urządzeniu przy telewizorze widok tylko do odczytu, który pokazuje plan sal z wyświetlanymi nazwami gości przy stolikach według opublikowanego rozkładu. Priority: must-have
  > Socratic: Counter-argument considered: "40 nazwisk na jednym ekranie jest nieczytelne." Resolution: użytkownik wybrał imiona na planie; czytelność ma mierzalny cel (NFR-006) i jest sprawdzana na próbie generalnej (Open Question 2).

### Rotacja
- FR-009: Organizator can wylosować projekt nowego rozkładu, który trzyma grupy razem, zostawia przypiętych na miejscach, pomija nieobecnych i unika sąsiadów z poprzednich rozkładów. Priority: must-have
  > Socratic: Counter-argument considered: "Czysta losowość może powtarzać sąsiadów." Resolution: losowanie unika powtórzeń sąsiadów (preferencja, nie twarda reguła).
- FR-010: Organizator can przejrzeć projekt rozkładu, wylosować go ponownie lub poprawić ręcznie, opublikować go na TV i telefony oraz wrócić do poprzedniego opublikowanego rozkładu. Priority: must-have

### Dostęp gości
- FR-011: Organizator can wydrukować karteczki z wyświetlaną nazwą i osobistym kodem QR każdego gościa oraz skopiować osobisty link każdego gościa. Priority: must-have
- FR-012: Organizator can włączyć i wyłączyć dostęp gości oraz unieważnić osobisty link gościa, wydając mu nowy. Priority: must-have
- FR-013: Gość can po otwarciu osobistego linku zobaczyć na telefonie swój stolik i miejsce w aktualnie opublikowanym rozkładzie. Priority: must-have
  > Socratic: Counter-argument considered: "Po przelosowaniu 40 telefonów musi się odświeżyć naraz." Resolution: telefony i TV pokazują nowy rozkład same, w ciągu 5 s (NFR-003).

### Rozmowy
- FR-014: Organizator can dodać, edytować i usunąć pytanie z kategorią (kontrowersyjne / generyczne / refleksyjne) oraz wkleić wiele pytań naraz. Priority: must-have
  > Socratic: Counter-argument considered: "Baza początkowa powinna być gotowa na starcie." Resolution: startowa baza (ok. 30 pytań na kategorię) przygotowana do przejrzenia przez użytkownika + hurtowe wklejenie.
- FR-015: Organizator lub gość can wylosować pytanie z bazy z wybranej kategorii albo ze wszystkich; wylosowane pytanie widzi tylko ten, kto je wylosował. Priority: must-have
- FR-016: Organizator lub gość can wygenerować z AI temat do rozmowy w wybranej kategorii; widzi go tylko ten, kto go wygenerował. Priority: must-have
  > Socratic: Counter-argument considered: "Koszt i abuse: 40 gości może zalewać AI zapytaniami." Resolution: limit 5 tematów na gościa i łączny limit na wieczór (NFR-005); osobiste linki uniemożliwiają obejście limitu zmianą tożsamości.

### Strzały kwoty
- FR-017: Gość can wpisać swój strzał kwoty (ile kosztowała cała kolacja, razem z napiwkiem) w złotych z groszami (≥ 0) i zmieniać go do zamknięcia przyjmowania; widzi tylko własny strzał. Priority: must-have
  > Socratic: Counter-argument considered: "Gość może wpisać strzał za kogoś innego." Resolution: strzał jest przypisany do osobistego linku; nikt nie wybiera tożsamości z listy.
- FR-018: Organizator can wpisać lub poprawić strzał za dowolnego gościa i zobaczyć, kto jeszcze nie oddał strzału. Priority: must-have
- FR-019: Organizator can zamknąć przyjmowanie strzałów i otworzyć je ponownie. Priority: must-have
- FR-020: Organizator can wpisać prawidłową kwotę i zobaczyć na własnym urządzeniu ranking strzałów według odległości od niej, czytany od ostatniego miejsca, z remisami jako równe miejsce. Priority: must-have

## Non-Functional Requirements

- NFR-001: 95% akcji gościa (zapis strzału, wylosowanie pytania z bazy, podgląd stolika) jest potwierdzonych w czasie ≤ 1 s przy działającej sieci w lokalu.
- NFR-002: Do 60 gości korzystających z telefonów jednocześnie (zapas na 35–40) nie pogarsza NFR-001 ani NFR-003.
- NFR-003: Po publikacji rozkładu ekran TV i otwarte telefony gości pokazują nowy rozkład w czasie ≤ 5 s, bez żadnej akcji gościa.
- NFR-004: Bez dostępu do sieci organizator widzi ostatni opublikowany rozkład i ranking strzałów zebranych przed awarią, także po odświeżeniu strony; funkcje gości i AI wracają razem z siecią.
- NFR-005: Gość wygeneruje najwyżej 5 tematów AI na wieczór; łącznie na wieczór powstaje najwyżej 300 tematów AI; organizator nie ma limitu na osobę. Temat AI pojawia się w czasie ≤ 10 s; gdy go nie ma, gość widzi komunikat i może wylosować pytanie z bazy, a nieudana próba nie zmniejsza limitu.
- NFR-006: Na ekranie TV cały plan z imionami mieści się bez przewijania, a każde imię ma wysokość co najmniej 2,5% wysokości ekranu.
- NFR-007: Projekt nowego rozkładu dla 60 gości jest gotowy w czasie ≤ 3 s.
- NFR-008: Widok gościa działa w dwóch ostatnich głównych wersjach popularnych przeglądarek mobilnych, bez instalacji i konta.
- NFR-009: Osobistego linku gościa, adresu TV ani linku organizatora nie da się odgadnąć ani wyprowadzić z innego linku.
- NFR-010: Interfejs i wszystkie teksty (także tematy AI) są po polsku.

## Business Logic

Losowanie rozsadza obecnych gości tak, by jak najmniej osób siedziało obok sąsiadów z poprzednich rozkładów, a nierozdzielne grupy zawsze siedziały razem.

Wejścia: lista obecnych gości, nierozdzielne grupy (2–5 osób), przypięte miejsca, stoliki z liczbą miejsc i typem oraz historia opublikowanych rozkładów. Sąsiad to osoba na miejscu obok; przy stoliku okrągłym to lewo i prawo (w kółko), przy prostokątnym lewo i prawo po tej samej stronie oraz osoba naprzeciwko. Członkowie grupy siedzą przy jednym stoliku na kolejnych miejscach i nie liczą się jako powtórzeni sąsiedzi. Unikanie powtórek to preferencja: gdy się nie da, losowanie wybiera układ z najmniejszą liczbą powtórzonych par. Grupy, przypięcia i pominięcie nieobecnych są twarde. Jeśli twardych reguł nie da się spełnić, organizator dostaje komunikat z przyczyną i nic się nie zmienia.

Wynik losowania to projekt, który organizator przegląda, poprawia i publikuje; dopiero opublikowany rozkład trafia na TV i telefony i wchodzi do historii. Drugą regułą jest ranking strzałów: ranking układa strzały wg bezwzględnej odległości od prawidłowej kwoty, a remis daje równe miejsce (kolejne miejsce jest pomijane, np. 1, 2, 2, 4). Organizator czyta ranking od ostatniego miejsca. Organizator nie oddaje strzału.

## Access Control

Bez kont i logowania. Każdy widok otwiera się wyłącznie przez link z niezgadywalnym kluczem.

| Rola | Jak wchodzi | Może | Nie może |
|---|---|---|---|
| Organizator | sekretny link organizatora (zakładka na jego telefonie/laptopie) | wszystko: goście, grupy, plan, stoliki, rozsadzenie, losowanie i publikacja, karteczki i linki, włącznik dostępu gości, baza pytań, AI bez limitu na osobę, strzały za gości, zamknięcie strzałów, prawidłowa kwota, ranking | — |
| TV | osobny adres tylko do odczytu, otwarty na urządzeniu przy telewizorze | oglądać opublikowany rozkład na planie z wyświetlanymi nazwami | widzieć strzały, ranking, projekty rozkładów, cokolwiek zmieniać |
| Gość | osobisty link / kod QR | widzieć swoją nazwę, stolik i miejsce; losować pytania; generować tematy AI (limit 5); wpisywać i zmieniać własny strzał do zamknięcia | widzieć strzały innych, ranking, dane innych gości poza nazwami na planie, cokolwiek z widoku organizatora |

- Wejście bez linku albo z nieznanym kluczem: strona z informacją, że dostęp jest tylko przez link od organizatora; żadnych danych.
- Wyłączony dostęp gości albo unieważniony link gościa: komunikat o braku dostępu; żadnych danych, żadnych akcji.
- Organizator też siedzi przy stole; jego miejsce widać w widoku organizatora, osobny link gościa nie jest mu potrzebny.

## Non-Goals

- Konta i logowanie: dostęp wyłącznie przez linki, bo to jednorazowy wieczór dla znajomych.
- Pokazywanie strzałów innych gości i rankingu w apce gościom lub na TV: wyniki czyta na głos organizator.
- Wiele wydarzeń naraz i archiwum poprzednich edycji: apka obsługuje jedną kolację.
- Rysowanie planu sal w apce: plan to wgrany zrzut z pinezkami stolików.
- Wysyłanie linków przez apkę (wiadomości, e-maile): organizator drukuje karteczki albo kopiuje linki i rozsyła sam.
- Wspólny kod QR na TV i wybór siebie z listy: tożsamość daje tylko osobisty link.
- Pełna praca bez sieci z późniejszą synchronizacją: bez sieci tylko odczyt ostatniego stanu, sieć ratuje hotspot.
- Strzały w procentach lub w innej walucie niż złoty.
- Moderacja pytań dodawanych przez organizatora: organizator odpowiada za własną bazę.
- (Niefunkcjonalne) Brak gwarancji dostępności poza przygotowaniami i wieczorem 2026-11-08 oraz obsługi powyżej 60 gości.
- (Niefunkcjonalne) Prywatność tylko na poziomie podstawowym: wyświetlane imiona/ksywki, dostęp przez linki, włącznik dostępu; bez audytu, szyfrowania end-to-end ani certyfikacji.
- (Niefunkcjonalne) Interfejs tylko po polsku, bez tłumaczeń.

## Open Questions

1. **Dokładny układ lokalu na 2026-11-08 (liczba sal, stolików, miejsc, typy stolików) i zrzut planu.** Apka jest elastyczna, więc nie blokuje budowy; potrzebne do konfiguracji i próby. Owner: user. By: 2026-11-05.
2. **Czytelność imion na planie na TV (NFR-006) przy realnym telewizorze i układzie.** Sprawdzane na próbie generalnej; jeśli nieczytelne, decyzja o zmianie widoku TV. Owner: user. By: 2026-11-06.
3. **Próba generalna całego flow z prawdziwymi telefonami, urządzeniem przy TV i siecią lokalu (oraz hotspotem jako zapasem).** Owner: user. By: 2026-11-06.
4. **Przegląd startowej bazy pytań przygotowanej przez asystenta.** Owner: user. By: 2026-11-05.
5. **Klucz do usługi AI i limit wydatków po stronie dostawcy; do tego czasu apka działa na atrapie AI.** Owner: user. By: 2026-11-05.
6. **Publiczny adres apki (hosting, konto) na kolację.** Wybór w kroku stacku, uruchomienie wymaga kont użytkownika. Owner: user + asystent. By: 2026-11-04.
