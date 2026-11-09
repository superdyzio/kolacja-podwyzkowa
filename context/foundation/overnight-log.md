# Overnight log — M-2

Dziennik decyzji, zależności i blokerów nocnego przebiegu M-2 (zasady: `overnight-brief.md`). Dziennik M-1: `archive/2026-10-27-overnight-log-m1.md`.

## Start

- Start: 2026-11-09 21:28 CET (polecenie użytkownika: „no to lecisz z tym wszystkim”). Ostatni nowy element może ruszyć do 2026-11-10 04:28.
- Gałąź: `overnight/m2` z `plan/m2-saas`.
- Środowisko: lokalny Supabase działa (baza, REST, gateway); `.env` → `127.0.0.1`; CLI podlinkowany do starego projektu (tylko polecenia lokalne); `.env` ma `AI_PROVIDER=anthropic`, więc serwery idą z `AI_PROVIDER=mock`.

## Decyzje

- 2026-11-09 — użytkownik potwierdził start nocy i zgodę z briefu na usuwanie plików kodu zastępowanych przez plan („no to lecisz z tym wszystkim”). F-02 planuje noc (subagent), bez sesji interaktywnej.

- 2026-11-09 (sesja interaktywna) — roadmapa M-2: `main_goal: speed`, gwiazda przewodnia S-11 `restaurant-events`, `top_blocker: time` przyjęte z rekomendacji (sesja kontynuowana bez dodatkowych pytań; użytkownik może nadpisać).
- 2026-11-09 (sesja interaktywna) — numeracja M-2 ciągnie się od M-1 (F-02, F-03, S-10..S-30). `restaurant-panel` z `m2-product-notes.md` podzielony na `platform-restaurants`, `restaurant-events`, `restaurant-team` i `admin-support-log`; `event-modules-branding` na `event-modules` i `event-branding`; z `scale-150` wydzielony `tv-room-rotation`.
- 2026-11-09 (sesja interaktywna) — przy sprzeczności `m2-product-notes.md` z PRD v2 wygrywa PRD v2 (role właściciel / menedżer / kelner; zamówienia zostają u klienta z cenami tylko do odczytu).

## Dodane zależności

(slice → pakiet → uzasadnienie; w M-2 domyślnie żadnych)

## Blokery

(brak)
