# Overnight log

Dziennik decyzji, zależności i blokerów nocnego builda (zasady: `overnight-brief.md`).

## Decyzje

- 2026-10-27 — roadmapa: `top_blocker: time` przyjęty z rekomendacji (użytkownik poszedł spać z poleceniem „zakładaj rekomendowane odpowiedzi”).
- 2026-10-27 — wykonanie: każdy slice planuje i implementuje osobny subagent, po kolei (nigdy równolegle), żeby oszczędzać zasoby maszyny i trzymać czysty kontekst; sesja główna weryfikuje testy, lint i build po każdym slice'ie.
- 2026-10-27 — zasoby: lokalny Supabase uruchamiany tylko z potrzebnymi usługami; bez testów w prawdziwej przeglądarce w nocy (Playwright pominięty), weryfikacja testami jednostkowymi i integracyjnymi na lokalnej bazie.

## Dodane zależności

(slice → pakiet → uzasadnienie)

## Blokery

(brak)
