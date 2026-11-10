---
change_id: restaurant-team
title: Restaurant team — invitations, roles, removal and password-reset links
status: implemented
created: 2026-11-10
updated: 2026-11-10
archived_at: null
---

## Notes

— S-12 (roadmap): Zespół lokalu. The owner invites managers and waiters, a manager invites waiters, with one-time expiring links (no e-mails, NFR-020); each in their own scope changes roles, removes people from the team and generates a one-time password-reset link. A manager cannot manage managers or the owner, cannot change restaurant settings, cannot permanently delete events or the restaurant. A removed person loses access to that restaurant at once (other restaurants' memberships stay). The restaurant never ends up without an owner (demoting/removing the last owner refused). Per-event waiter („kelner na imprezę”) and the waiter's day view are S-21 (not here; waiters land on the existing minimal restaurant page). PRD refs: FR-023, US-05. Prerequisite S-10 done (S-11 done too). Sources: context/foundation/prd-v2.md, context/foundation/roadmap.md (### S-12), context/foundation/shape-notes.md (## Forward: tech-stack, ## Forward: technical-roadmap), context/foundation/m2-product-notes.md (stale numbering/roles/client scope; PRD v2 wins), context/foundation/overnight-brief.md. Unattended overnight run.
