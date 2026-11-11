import type { ClientRoutePattern } from "@/lib/client-routes/match";
import { parseEventName } from "@/lib/events/rules";

// Rules of a restaurant's venue templates (venue-templates, S-15; FR-030). Pure: islands import it directly.
//
// A template is an event row with is_template = true (supabase/migrations/20261110200000_venue_templates.sql). Its
// venue is edited with the client's venue editor through the template dispatcher
// (src/pages/api/panel/templates/[id]/sala/[...path].ts), which runs ONLY these organizer routes — the venue ones,
// plus a read of the (always empty) seating board that the editor uses for its seat-loss warnings.

export const TEMPLATE_ROUTE_PATTERNS = [
  "venue",
  "venue/layout",
  "venue/layout-proposal",
  "plan",
  "plan/image",
  "rooms",
  "rooms/:id",
  "tables",
  "tables/:id",
  "seating",
] as const satisfies readonly ClientRoutePattern[];

export type TemplateRoutePattern = (typeof TEMPLATE_ROUTE_PATTERNS)[number];

const READ_ONLY_PATTERNS: ReadonlySet<ClientRoutePattern> = new Set(["seating"]);

// Whether the template dispatcher runs this organizer route for this method: a venue route with any method its
// module has, the seating board only for GET (and HEAD).
export function templateMayRun(pattern: ClientRoutePattern, method: string): boolean {
  if (!(TEMPLATE_ROUTE_PATTERNS as readonly ClientRoutePattern[]).includes(pattern)) {
    return false;
  }
  const upper = method.toUpperCase();
  return !READ_ONLY_PATTERNS.has(pattern) || upper === "GET" || upper === "HEAD";
}

export type TemplateNameResult = { ok: true; name: string } | { ok: false; reason: "empty" | "too-long" };

// A template's name follows the event name rule (normalized, 1–120 code points): it is an event row.
export function parseTemplateName(raw: string): TemplateNameResult {
  return parseEventName(raw);
}

// The key both the preview and the database (apply_venue_template: lower(name)) match rooms and tables by.
export function venueNameKey(name: string): string {
  return name.toLowerCase();
}

export function templatePath(templateId: number): string {
  return `/panel/szablony/${String(templateId)}`;
}

// The template editor's API base (the dispatcher).
export function templateApiBase(templateId: number): string {
  return `/api/panel/templates/${String(templateId)}/sala`;
}
