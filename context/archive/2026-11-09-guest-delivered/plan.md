# Guests mark delivered pieces — Implementation Plan

## Overview

A guest's phone gets „Twoje zamówienie”: their own order lines and the lines for the middle of their table (latest
published seating), no prices, every piece with its own „Dotarło”. The organizer marks single pieces too („Wydane” stays
for the whole line) and sees who marked each piece; the restaurant sees partly served lines; the organizer's order page
refreshes itself.

## Decisions

- Scope A: own lines + the table's lines of the guest's table in the latest snapshot; never a tablemate's personal dish.
- A guest may undo a guest's mark (anyone's at the table), never the organizer's; the organizer may undo anything.
- Who marked: stored per piece (`order_piece.marked_by`, `guest_id`); a guest sees „Ty / gość / organizator” (no
  names: the marker may sit elsewhere by now), the organizer the guest's live name.
- Per piece: `order_piece` rows (1 … quantity); `order_item.delivered` kept in step (old code, rollback).
- One RPC per write (`set_order_pieces`): lock, right check, range, organizer-mark rule, column sync — no check-then-write gap.
- Guest token: the name hash also covers the order lines (no new part; 62/64 chars worst case unchanged); the 204 and
  200 paths share `getGuestOrders`.

## What We're NOT Doing

- No prices, ids or tablemates' personal dishes on phones; nothing on the TV.
- No timestamps in the UI; no notifications; no change to placement or the serving highlight beyond per-piece state.

## Phase 1: Delivered pieces end to end

- Migration `20261107120000_order_piece_delivery.sql` (table, backfill of ticked lines, trigger, three functions,
  grants), DB types, DTOs.
- Pure `pieces.ts`; totals, prep, restaurant and serving per piece.
- Service (`markOrderPieces`, `markGuestPiece`, `getGuestOrders`), guest token and state, routes
  `PUT /api/o/<key>/orders/<id>/pieces` and `PUT /api/g/<key>/orders`.
- UI: `GuestOrderView`, `OrderLineRow` piece chips and markers, restaurant „served 1 of 2”, piece chips of the serving
  highlight, `useOrderBoard` polling.
- Tests: unit (pieces, serving off-by-one, totals, token), integration (`order-pieces.test.ts`: rights, marks, quantity
  trigger, column sync, token parity), smoke 23b; docs.

### Success Criteria

#### Automated Verification

- `npm run lint`, `npx astro check`, `npm test` on a fresh local DB, `npm run build`, smoke on a fresh DB, `npm run package:lambda`.

#### Manual Verification

- Guest phone: mark a piece, undo, see the organizer's mark arrive; `/zamowienia` piece chips and auto-refresh;
  restaurant partly served.

## Progress

### Phase 1: Delivered pieces end to end

#### Automated

- [x] 1.1 Migration, DB types, DTOs
- [x] 1.2 Pure piece rules; totals, prep, restaurant, serving per piece
- [x] 1.3 Service, token, routes with integration tests
- [x] 1.4 Guest phone section, organizer piece chips and polling, restaurant
- [x] 1.5 Smoke, docs, full checks

#### Manual

- [ ] 1.6 Checked in Chrome by the user (headless local check done: guest marks, organizer row, restaurant, polls)
