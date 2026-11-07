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
| Restauracja | `/r/<klucz>`  | tylko do odczytu: zamówienie i plan, bez cen     |
| Inne        | —             | strona „Brak dostępu” (HTTP 404), żadnych danych |

## Języki

Cała aplikacja działa po polsku i po angielsku. Przełącznik **PL / EN** jest w prawym górnym rogu każdej strony (poza TV i karteczkami do druku); wybór zapamiętuje ciasteczko na rok. Domyślnie wszystko jest po polsku, a link restauracji po angielsku — restauracja ma własne ciasteczko, więc wybór organizatora nie zmienia jej tabletu i odwrotnie. Język da się też ustawić linkiem: dopisz `?lang=en` albo `?lang=pl` (np. dla TV: `/tv/<klucz>?lang=en`). Nie tłumaczą się treści z bazy: imiona, nazwy sal, stolików i dań, uwagi oraz pytania (także baza startowa). Tematy AI powstają w języku osoby, która je losuje.

## Reset danych

Na dole panelu organizatora jest karta „Reset danych”. „Resetuj…” otwiera okno z listą rzeczy do wyczyszczenia, każda z opisem i aktualną liczbą: strzały (z prawidłową kwotą), licznik tematów AI, rozsadzenie z historią publikacji, goście i grupy, plan z salami i stolikami, zamówienia (link restauracji zostaje), pytania (wraca baza startowa) oraz linki gości (nowe linki, dostęp gości wyłączony — wydrukowane karteczki przestają działać). Goście pociągają za sobą strzały, licznik AI i rozsadzenie, a plan — rozsadzenie. Jedno kliknięcie „Resetuj zaznaczone” czyści wszystko naraz (jedna transakcja w bazie). Link organizatora i adres TV się nie zmieniają, więc np. po próbie generalnej wystarczy zresetować wszystko i od nowa wgrać dane (także `npm run demo`).

## Tematy AI

Goście i organizator generują temat do rozmowy od AI w wybranej kategorii. Gość ma najwyżej 15 tematów na wieczór, wszyscy razem (z organizatorem) 1000; organizator nie ma osobnego limitu. Licznik zeruje „Reset danych” → „Licznik tematów AI” (nic innego nie znika). Nieudana próba (np. przekroczony czas 9 s) nie zmniejsza limitu. Tematy nie są nigdzie zapisywane: widzi je tylko osoba, która je wygenerowała.

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

## Plan sali

TV i telefony gości nie pokazują zdjęcia planu, tylko rysunek: kontury sal z nazwami, stoliki z krzesłami i imię każdego gościa przy jego krześle. Rysunek powstaje na `/o/<klucz>/sale` na podstawie wgranego zdjęcia (zdjęcie widać tam tylko jako półprzezroczyste tło):

1. Wgraj zdjęcie planu i dodaj sale.
2. „Zaproponuj układ ze zdjęcia (AI)”: AI (Claude Sonnet 5.5, do 30 s, kilka centów; na atrapie — siatka przykładowa) proponuje położenie i obrót stolików, nowe stoliki, kontury sal i skalę krzeseł. Każda zmiana ma swój ptaszek; odznacz, czego nie chcesz, i „Zastosuj zaznaczone”. Do AI idą tylko zdjęcie oraz nazwy sal i stolików — nigdy dane gości.
3. Popraw ręcznie: przeciągnij stolik, obróć go uchwytem (co 15°, z Shift dowolnie), strzałki przesuwają, `[` i `]` obracają wybrany stolik. „Kontur” przy sali rysuje jej prostokąt. „Skala krzeseł” zmienia rozmiar wszystkich stolików naraz. „Podgląd jak na TV” pokazuje rysunek z imionami.
4. Zmiany rysunku nie ruszają przypisań gości. TV i telefony pokażą nowy rysunek dopiero po „Opublikuj” na stronie rozsadzenia.

Na produkcji: przed `npx supabase db push` zrób kopię danych (`npx supabase db dump --data-only -f ~/kolacja-backup-<data>.sql`), potem `db push`, potem `npm run deploy:aws` (podnosi limit czasu Lambdy do 30 s). Do czasu przerysowania TV rysuje dotychczasowy układ z domyślnymi wartościami.

## Zamówienia i restauracja

Na `/o/<klucz>/zamowienia` organizator prowadzi zamówienie jedzenia: każda pozycja to danie (podpowiedzi z dań już wpisanych, cena podstawia się sama), cena za sztukę, ilość, opcjonalna uwaga dla kuchni i dla kogo — osoba (podanie na jej miejsce), stolik (na środek stołu) albo nieprzypisane. Widać sumę pozycji, łączną kwotę, listę „Do przygotowania” i każdą pozycję z ptaszkiem „Wydane”; wszystko da się poprawić albo usunąć.

Link dla restauracji (`/r/<klucz>`, w panelu i w `npm run links`) działa zawsze, domyślnie jest po angielsku i nie ma cen: lista dań do przygotowania (z uwagami i tym, co jeszcze do wydania), rysunek sali jak na TV oraz, stolik po stoliku, co podać na które miejsce i co na środek stołu. Wydane pozycje są przekreślone. Strona sama odświeża się co 15 s. Miejsca biorą się z **opublikowanego** rozsadzenia: osoba albo stolik spoza opublikowanego planu trafia do „Do ustalenia z organizatorem”. „Wymień link” od razu unieważnia stary link — wyślij restauracji nowy.

Na obu stronach (u organizatora i w restauracji) obok list jest plan sali. Kliknięcie dania na liście „Do przygotowania” zapala na planie wszystkie miejsca, gdzie ma trafić — krzesła gości albo środek stołu, z numerami sztuk — i rozwija listę sztuk: każdą sztukę (np. „3 · Dąb · m. 7 · Darek”) można wybrać osobno, wtedy świeci tylko jej miejsce. Kliknięcie pojedynczej pozycji przy stoliku zapala jej miejsce. Nad planem jest podpis słowami („Rosół 3/9 → Stolik Dąb · miejsce 7 · Darek”), wydane sztuki są szare, a „Wyczyść” albo Esc gasi zaznaczenie. Na wąskim ekranie plan jest nad listami i przypina się u góry, dopóki coś jest zaznaczone.

Na produkcji ta zmiana wymaga migracji bazy **przed** wdrożeniem kodu: bez niej każda strona organizatora kończy się błędem 500 (panel czyta link restauracji). Kolejność: kopia danych (`npx supabase db dump --data-only -f ~/kolacja-backup-<data>.sql`), `npx supabase db push` (wgrywa też migrację planu sali, jeśli jeszcze jej nie było), potem `npm run deploy:aws`. Migracja tylko dodaje: istniejące linki organizatora, TV i gości się nie zmieniają.

## Co dotarło na stół

Gość widzi na swoim telefonie sekcję „Twoje zamówienie”: swoje dania i dania na środek swojego stolika (z opublikowanego rozsadzenia), bez cen. Każdą sztukę zaznacza osobno przyciskiem „Dotarło” (dzbanek × 2 to dwa przyciski) i może to cofnąć. Zaznaczenie organizatora może cofnąć tylko organizator. Przy każdej sztuce widać, kto ją zaznaczył: gość widzi „Ty”, „gość” albo „organizator”, organizator widzi imię gościa. U organizatora (`/o/<klucz>/zamowienia`) „Wydane” dalej zaznacza całą pozycję, a przy pozycjach z kilkoma sztukami są osobne przyciski sztuk („✓ 2 · Basia”); strona odświeża się sama co 5 s. Restauracja widzi „wydane 1 z 2”, a na planie wydane sztuki są szare.

Na produkcji ta zmiana wymaga migracji bazy **przed** wdrożeniem kodu (bez niej telefony gości przestają się odświeżać): kopia danych, `npx supabase db push`, potem `npm run deploy:aws`. Między `db push` a wdrożeniem nie odhaczaj „Wydane”. Migracja tylko dodaje tabelę i funkcje; już odhaczone pozycje zostają wydane (wszystkie sztuki, przez organizatora). Telefony otwarte przed wdrożeniem pokażą nową sekcję dopiero po odświeżeniu strony.

## Typ miejsca w konkursie strzałów

Obok kwoty gość może (nie musi) wpisać, które miejsce zajmie w rankingu: od 1 do liczby gości. Zapisuje się razem z kwotą i można go zmieniać (albo wyczyścić) do zamknięcia przyjmowania. Telefon ze starą wersją strony (otwartą przed wdrożeniem) wysyła samą kwotę — wtedy zapisany typ zostaje. Ranking nadal liczy się tylko z kwoty. Organizator może wpisać albo poprawić typ za gościa („Popraw” przy gościu na `/o/<klucz>/strzaly`).

W rankingu organizatora podium jest na złoto, srebrno i brązowo (z medalem), a na zielono każdy, kto trafił swoje miejsce. Pod rankingiem jest lista „Trafione miejsca” — do nagrody pocieszenia. Remis zajmuje wszystkie swoje miejsca: gdy dwie osoby dzielą 2. miejsce, trafiają, typując 2 albo 3. „Czytaj od końca” i odczyt bez sieci pokazują typ i trafienie przy każdej osobie. Gość widzi tylko swój typ, nigdy cudzych i nie wie, czy trafił.

Na produkcji ta zmiana wymaga migracji bazy **przed** wdrożeniem kodu (bez niej strona gościa i `/strzaly` kończą się błędem): kopia danych (`npx supabase db dump --data-only -f ~/kolacja-backup-<data>.sql`), `npx supabase db push`, potem `npm run deploy:aws`. Migracja tylko dodaje kolumnę i funkcję; istniejące strzały, linki i klucze zostają bez zmian.

## Skrypty

- `npm run dev`, `npm run build`, `npm run preview`: serwer deweloperski, build produkcyjny, podgląd buildu.
- `npm test`: testy jednostkowe i integracyjne. Integracyjne działają tylko z lokalnym Supabase (`SUPABASE_URL` na `127.0.0.1`), inaczej są pomijane.
- `npm run lint`, `npx astro check`: lint i sprawdzanie typów.
- `npm run env:local`: zapisuje dane lokalnego Supabase do `.env` (jedyny plik ze zmiennymi; stary `.dev.vars` z czasów Cloudflare nie jest już używany).
- `npm run links`: wypisuje link organizatora, adres TV i link restauracji z bazy.
- `npm run smoke`: test HTTP macierzy dostępu na działającym serwerze (`BASE_URL`, domyślnie `http://localhost:4321`). Wymaga bazy bez wydarzenia. `npm run preview` czyta `.env` przy starcie, więc po zmianie `.env` uruchom podgląd ponownie.
- `npm run package:lambda`: build do `dist-lambda/build` (nie rusza `dist/` podglądu) i paczka `dist-lambda/function.zip` dla AWS Lambda, ze sprawdzeniem (bez plików env i sekretów, bez modułów natywnych, zip < 50 MB, rozpakowany zip startuje poza repozytorium).
- `npm run deploy:aws`: wdrożenie na AWS Lambda (patrz niżej); `-- --dry-run` tylko wypisuje plan.
- `npm run demo`: wypełnia lokalną aplikację danymi demo do sprawdzeń ręcznych (40 gości, plan, 3 sale, 7 stolików, grupy 4/2/2, 1 nieobecny, 1 przypięty, opublikowany rozkład, 30 strzałów z remisem, 12 z typem miejsca, zamówienie z 9 pozycjami) przez API działającego serwera (`BASE_URL`) i wypisuje linki. Tworzy wydarzenie, gdy go nie ma; odmawia, gdy wydarzenie ma już gości, sale albo plan.

## CI

GitHub Actions (`.github/workflows/ci.yml`) na gałęzi `main`:

- `ci`: lint, `astro check`, `npm test` (bez testów bazy) i build.
- `smoke`: lokalny Supabase, `npm test` z testami bazy, build, podgląd produkcyjny i `npm run smoke`.

CI niczego nie wdraża i nie ma dostępu do AWS: wdrożenie uruchamiasz sam (`npm run deploy:aws`).

## Wdrożenie na AWS

Aplikacja działa jako jedna funkcja AWS Lambda (arm64, Node.js 24, 1024 MB, 30 s) pod stałym adresem Function URL (`https://<id>.lambda-url.<region>.on.aws/`, bez logowania — dostęp dają klucze w linkach). Warstwa AWS Lambda Web Adapter (v1.1.0, wersja warstwy 30) przekazuje żądania do serwera Node z paczki. Baza to hostowany projekt Supabase (plan Free). Tylko darmowe usługi: bez API Gateway, CloudFront, S3, ECR i VPC. Klucz service role omija RLS, więc nigdy nie trafia do przeglądarki ani do repozytorium.

### Przygotowanie (raz)

1. AWS CLI v2 (aktualne — skrypt używa `--invoked-via-function-url`) i logowanie: `aws login --profile mikusia` (inny profil: zmienna `AWS_PROFILE`).
2. Projekt Supabase (Free) w **tym samym regionie**, w którym ma działać Lambda (np. Frankfurt = `eu-central-1`); inny region to wolniejsze zapytania przy każdym odświeżeniu telefonów.
3. Schemat bazy (sam, ze swojego komputera): `npx supabase login`, `npx supabase link --project-ref <ref projektu>`, `npx supabase db push`.
4. Plik `.env.aws` w katalogu projektu (jest w `.gitignore`; dane z panelu Supabase → Project Settings → API):

   ```bash
   SUPABASE_URL=https://<ref projektu>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<klucz service_role>
   AI_PROVIDER=mock
   # ANTHROPIC_API_KEY=<klucz>          # wymagany przy AI_PROVIDER=anthropic
   # AI_MODEL=claude-haiku-5-5          # opcjonalnie
   ```

   Skrypt przyjmuje tylko te nazwy i odmawia lokalnego albo nie-https `SUPABASE_URL`.

### Wdrożenie

```bash
AWS_REGION=eu-central-1 npm run deploy:aws -- --dry-run   # sam plan komend aws, nic nie wywołuje
AWS_REGION=eu-central-1 npm run deploy:aws
```

`AWS_REGION` jest wymagany (bez wartości domyślnej). Skrypt buduje paczkę (`npm run package:lambda`), a potem tworzy brakujące albo aktualizuje istniejące: rolę IAM `kolacja-podwyzkowa-lambda` (tylko logi), funkcję `kolacja-podwyzkowa`, Function URL z publicznym dostępem i grupę logów `/aws/lambda/kolacja-podwyzkowa` (7 dni). Niczego nie usuwa, więc adres się nie zmienia i wydrukowane karteczki QR działają po każdym kolejnym wdrożeniu. Sekrety idą do AWS przez plik tymczasowy (0600, usuwany) i nie są wypisywane. Na końcu skrypt podaje adres i sprawdza, czy odpowiada.

### Pierwsze uruchomienie

1. Pierwsze wdrożenie na `AI_PROVIDER=mock` (pusta baza).
2. Smoke na prawdziwym adresie: `BASE_URL=https://<id>.lambda-url.<region>.on.aws npm run smoke` (bez `/` na końcu; tworzy wydarzenie testowe i odmawia na prawdziwym AI).
3. Wyczyść dane smoke: Supabase → SQL Editor → `delete from public.event;` (reszta usuwa się kaskadowo).
4. AI: w `.env.aws` ustaw `AI_PROVIDER=anthropic` i `ANTHROPIC_API_KEY` (z limitem wydatków w konsoli Anthropic) i wdroż ponownie tą samą komendą.
5. Otwórz adres, „Utwórz wydarzenie”, link organizatora do zakładek. Linki gości i karteczki drukuj z tego adresu (są `https://`).

### Koszty i limity

- Darmowy próg Lambdy (1 mln żądań i 400 000 GB-s miesięcznie) z zapasem wystarcza na wieczór: 40 telefonów odpytujących co 2,5 s to ok. 16 żądań/s, czyli ok. 60 tys. na godzinę. Mimo to ustaw alert budżetu: Billing → Budgets → „Zero spend budget” (albo 1 USD).
- Współbieżność: każda instancja Lambdy obsługuje jedno żądanie naraz. Sprawdź limit konta: `aws lambda get-account-settings --profile mikusia --region <region>` (`AccountLimit.ConcurrentExecutions`). Nowe konta mają czasem tylko 10 — wtedy przed imprezą poproś o więcej w Service Quotas.
- Plan sali: najwyżej 4 MB (Function URL koduje plik w base64 w ładunku ≤ 6 MB). Odczyt układu przez AI wysyła zdjęcie zmniejszone w przeglądarce (≤ 1,5 MB) i trwa do 25 s; Lambda ma limit 30 s.
- Po dłuższej przerwie pierwsze żądanie startuje funkcję (ok. 1 s). Otwórz TV i panel organizatora przed przyjściem gości.
- Supabase Free usypia projekt po tygodniu bez ruchu — kilka dni przed imprezą otwórz aplikację (albo wznów projekt w panelu).
- Logi: CloudWatch, grupa `/aws/lambda/kolacja-podwyzkowa`. Wersja warstwy Lambda Web Adapter jest przypięta w `scripts/lib/aws-deploy.mjs`.
