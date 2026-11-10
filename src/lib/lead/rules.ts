// Who edits an event's client work (client-restaurant-split, S-14; PRD v2 FR-026, „Kto prowadzi wydarzenie”). One
// column, `event.venue_leads`: false (default) = the client edits through the organizer link and the restaurant's staff
// only preview its work in the panel; true („Lokal prowadzi”) = the staff edit through the panel and the organizer link
// is view-only. Every write of either side checks it, so the two never edit at once. Reads are never affected, and
// neither are the guests', the TV's and the tablet's links. Pure.

// The `code` of the 409 answers, so islands and the smoke can tell the two refusals apart.
export const LEAD_CODES = { venueLeads: "venue-leads", clientLeads: "client-leads" } as const;

export type LeadCode = (typeof LEAD_CODES)[keyof typeof LEAD_CODES];

// The organizer link may change the event's data only while the client leads.
export function clientMayWrite(venueLeads: boolean): boolean {
  return !venueLeads;
}

// The staff may change the client's work (through the panel) only while „Lokal prowadzi” is on. Their own areas —
// the switch, prices, the full reset, the links — are not the client's work and are never gated by it.
export function staffMayWrite(venueLeads: boolean): boolean {
  return venueLeads;
}

// Paths of the organizer API (the client's writes are refused there while the venue leads).
export function isOrganizerApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/o/");
}
