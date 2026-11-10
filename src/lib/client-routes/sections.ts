// The client's sections as the restaurant panel previews them (client-restaurant-split, S-14):
// /panel/wydarzenia/<id>/<section> renders the client's island for that section with the panel's API base. The slugs
// are the client's own (/o/<key>/<section>), so the islands' links between sections work in both places. Pure.

export const CLIENT_SECTIONS = ["goscie", "sale", "rozsadzenie", "linki", "strzaly", "pytania", "zamowienia"] as const;

export type ClientSection = (typeof CLIENT_SECTIONS)[number];

// Sections whose answers carry the guests' link keys: never in the platform admin's support mode.
export const KEY_SECTIONS: readonly ClientSection[] = ["linki"];

export function isClientSection(value: unknown): value is ClientSection {
  return typeof value === "string" && (CLIENT_SECTIONS as readonly string[]).includes(value);
}

export function panelEventPath(eventId: number): string {
  return `/panel/wydarzenia/${String(eventId)}`;
}

export function clientSectionPath(eventId: number, section: ClientSection): string {
  return `${panelEventPath(eventId)}/${section}`;
}

// The client's API for the panel's islands (the dispatcher, src/pages/api/panel/events/[id]/klient/[...path].ts).
export function panelClientApiBase(eventId: number): string {
  return `/api/panel/events/${String(eventId)}/klient`;
}

// What staff may do with the client's work, by who leads and whether it is the admin's support mode.
export function previewMode(venueLeads: boolean, support: boolean): "support" | "staff-leads" | "staff-preview" {
  return support ? "support" : venueLeads ? "staff-leads" : "staff-preview";
}
