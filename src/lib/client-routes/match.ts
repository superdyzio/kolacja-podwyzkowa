// The client's API as the panel reuses it (client-restaurant-split, S-14). Staff of the event's restaurant call
// /api/panel/events/<id>/klient/<sub-path>; the dispatcher runs the organizer route of /api/o/<key>/<sub-path> for that
// event (same validation, same answers). These are the sub-paths it knows — one per organizer route file except the
// client-only ones — with ":id" for a dynamic segment (the handler checks it like it does for the client). A test
// compares this list with src/pages/api/o/[key]/** so no organizer route escapes the panel unnoticed. Pure.

export const CLIENT_ROUTE_PATTERNS = [
  "ai-topics",
  "drinks",
  "drinks/:id",
  "groups",
  "groups/:id",
  "guesses",
  "guesses/:id",
  "guest-links",
  "guest-links/:id/revoke",
  "guests",
  "guests/:id",
  "modules",
  "orders",
  "orders/:id",
  "orders/:id/pieces",
  "plan",
  "plan/image",
  "questions",
  "questions/:id",
  "questions/draw",
  "questions/starter",
  "rooms",
  "rooms/:id",
  "seating",
  "seating/draft",
  "seating/guests/:id",
  "seating/history",
  "seating/publish",
  "seating/published",
  "seating/restore",
  "tables",
  "tables/:id",
  "tv-spotlight",
  "tv-spotlight/person",
  "venue",
  "venue/layout",
  "venue/layout-proposal",
] as const;

export type ClientRoutePattern = (typeof CLIENT_ROUTE_PATTERNS)[number];

// Organizer routes the panel never runs: the client's trial reset (staff have the full one), and the routes that
// answer the client link with the identical denial (full reset, the tablet link: the panel has its own).
export const CLIENT_ONLY_ROUTES = ["reset", "restaurant-link", "trial-reset"] as const;

// Answers carrying link keys (the guests' personal links): never in the admin's support mode (keys never reach it).
const KEY_ROUTES: ReadonlySet<ClientRoutePattern> = new Set(["guest-links", "guest-links/:id/revoke"]);

export function isKeyRoute(pattern: ClientRoutePattern): boolean {
  return KEY_ROUTES.has(pattern);
}

export interface ClientRouteMatch {
  pattern: ClientRoutePattern;
  // The ":id" segment as typed (handlers parse it like they do for the client link), else undefined.
  id: string | undefined;
}

// Literal segments win over ":id" ("questions/draw" is never "questions/:id").
export function matchClientRoute(path: string | undefined): ClientRouteMatch | null {
  const segments = (path ?? "").split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return null;
  }
  let best: ClientRouteMatch | null = null;
  let bestLiterals = -1;
  for (const pattern of CLIENT_ROUTE_PATTERNS) {
    const parts = pattern.split("/");
    if (parts.length !== segments.length) {
      continue;
    }
    let id: string | undefined;
    let literals = 0;
    const ok = parts.every((part, index) => {
      if (part === ":id") {
        id = segments[index];
        return true;
      }
      literals += 1;
      return part === segments[index];
    });
    if (ok && literals > bestLiterals) {
      best = { pattern, id };
      bestLiterals = literals;
    }
  }
  return best;
}
