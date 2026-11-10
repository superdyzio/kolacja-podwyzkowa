import { loadStarterQuestions } from "@/lib/questions/service";
import { getSeatOccupancy } from "@/lib/seating/service";
import type { DbClient } from "@/lib/supabase-client";
import { getVenue } from "@/lib/venue/service";
import type { TemplateUpdatePreviewDto, TemplateUpdateResultDto, VenueTemplateSummaryDto } from "@/types";
import { templateUpdatePreview } from "./preview";

// A restaurant's venue templates in the panel (venue-templates, S-15; FR-030). A template is an event row with
// is_template = true; every query here is filtered by the restaurant the central guard opened AND by is_template, so
// a template of another restaurant, an event id and an unknown id all behave alike ("not-found" / null). Copies and
// the update are database functions (one transaction each). Supabase errors throw.

function fail(action: string, message: string): never {
  throw new Error(`Nie udało się ${action}: ${message}`);
}

function raised(message: string, code: string): boolean {
  return message.includes(code);
}

// The template row behind an id, or null (an event, unknown): the first step of the template guard
// (findPanelTemplate in src/lib/panel-api.ts), which then opens its restaurant.
export async function findTemplateRow(
  db: DbClient,
  templateId: number,
): Promise<{ id: number; name: string; restaurantId: number } | null> {
  const { data, error } = await db
    .from("event")
    .select("id, name, restaurant_id")
    .eq("id", templateId)
    .eq("is_template", true)
    .maybeSingle();
  if (error) {
    fail("odczytać szablonu sali", error.message);
  }
  return data ? { id: data.id, name: data.name, restaurantId: data.restaurant_id } : null;
}

// Every template of the restaurant with its counters, by name (Polish order) then id.
export async function listVenueTemplates(db: DbClient, restaurantId: number): Promise<VenueTemplateSummaryDto[]> {
  return readSummaries(db, restaurantId, null);
}

export async function getVenueTemplate(
  db: DbClient,
  restaurantId: number,
  templateId: number,
): Promise<VenueTemplateSummaryDto | null> {
  return (await readSummaries(db, restaurantId, templateId))[0] ?? null;
}

async function readSummaries(
  db: DbClient,
  restaurantId: number,
  templateId: number | null,
): Promise<VenueTemplateSummaryDto[]> {
  let query = db.from("event").select("id, name").eq("restaurant_id", restaurantId).eq("is_template", true);
  if (templateId !== null) {
    query = query.eq("id", templateId);
  }
  const { data: rows, error } = await query;
  if (error) {
    fail("odczytać szablonów sal", error.message);
  }
  if (rows.length === 0) {
    return [];
  }
  const ids = rows.map((row) => row.id);
  const [rooms, tables, plans] = await Promise.all([
    db.from("venue_room").select("event_id").in("event_id", ids),
    db.from("venue_table").select("event_id, seat_count").in("event_id", ids),
    db.from("venue_plan").select("event_id").in("event_id", ids),
  ]);
  for (const result of [rooms, tables, plans]) {
    if (result.error) {
      fail("policzyć sal szablonów", result.error.message);
    }
  }
  return rows
    .map((row) => {
      const own = (tables.data ?? []).filter((table) => table.event_id === row.id);
      return {
        id: row.id,
        name: row.name,
        roomCount: (rooms.data ?? []).filter((room) => room.event_id === row.id).length,
        tableCount: own.length,
        seatCount: own.reduce((sum, table) => sum + table.seat_count, 0),
        hasPlan: (plans.data ?? []).some((plan) => plan.event_id === row.id),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pl", { numeric: true }) || a.id - b.id);
}

export type CreateTemplateResult = { status: "created"; template: VenueTemplateSummaryDto } | { status: "not-found" };

// A new template: empty (sourceEventId null) or a copy of the venue of an event of the SAME restaurant (another
// restaurant's or an unknown event → "not-found", like an unknown id). The name is validated.
export async function createVenueTemplate(
  db: DbClient,
  restaurantId: number,
  name: string,
  sourceEventId: number | null,
): Promise<CreateTemplateResult> {
  const { data, error } = await db.rpc("create_venue_template", {
    p_restaurant_id: restaurantId,
    p_name: name,
    p_source_event_id: sourceEventId,
  });
  if (error) {
    if (raised(error.message, "SOURCE_NOT_FOUND") || raised(error.message, "RESTAURANT_NOT_FOUND")) {
      return { status: "not-found" };
    }
    fail("utworzyć szablonu sali", error.message);
  }
  const template = await getVenueTemplate(db, restaurantId, data);
  return template ? { status: "created", template } : { status: "not-found" };
}

export async function renameVenueTemplate(
  db: DbClient,
  restaurantId: number,
  templateId: number,
  name: string,
): Promise<"updated" | "not-found"> {
  const { data, error } = await db
    .from("event")
    .update({ name })
    .eq("id", templateId)
    .eq("restaurant_id", restaurantId)
    .eq("is_template", true)
    .select("id");
  if (error) {
    fail("zapisać nazwy szablonu", error.message);
  }
  return data.length > 0 ? "updated" : "not-found";
}

// Deletes the template and its venue (ON DELETE CASCADE). Events created from it keep their own copies.
export async function deleteVenueTemplate(
  db: DbClient,
  restaurantId: number,
  templateId: number,
): Promise<"deleted" | "not-found"> {
  const { data, error } = await db
    .from("event")
    .delete()
    .eq("id", templateId)
    .eq("restaurant_id", restaurantId)
    .eq("is_template", true)
    .select("id");
  if (error) {
    fail("usunąć szablonu sali", error.message);
  }
  return data.length > 0 ? "deleted" : "not-found";
}

// A new event of the restaurant with a copy of the template's venue (one transaction), then — best effort, like every
// new event (createEvent) — the starter questions. The input is validated.
export async function createEventFromTemplate(
  db: DbClient,
  restaurantId: number,
  templateId: number,
  input: { name: string; date: string; expectedGuests: number | null },
): Promise<{ status: "created"; eventId: number } | { status: "not-found" }> {
  const { data, error } = await db.rpc("create_event_from_template", {
    p_restaurant_id: restaurantId,
    p_template_id: templateId,
    p_name: input.name,
    p_date: input.date,
    p_expected_guests: input.expectedGuests,
  });
  if (error) {
    if (raised(error.message, "TEMPLATE_NOT_FOUND")) {
      return { status: "not-found" };
    }
    fail("utworzyć wydarzenia z szablonu", error.message);
  }
  try {
    await loadStarterQuestions(db, data);
  } catch (seedError) {
    // eslint-disable-next-line no-console -- the only trace of a failed seed (server logs); the event itself is fine
    console.error("Nie udało się wczytać bazy startowej pytań:", seedError);
  }
  return { status: "created", eventId: data };
}

// What „Zaktualizuj z szablonu” would change in the event's venue, or null when the template is not one of the
// restaurant's. The event was opened by the event guard (same restaurant).
export async function previewTemplateUpdate(
  db: DbClient,
  restaurantId: number,
  eventId: number,
  templateId: number,
): Promise<TemplateUpdatePreviewDto | null> {
  const template = await getVenueTemplate(db, restaurantId, templateId);
  if (!template) {
    return null;
  }
  const [eventVenue, occupancy, templateVenue] = await Promise.all([
    getVenue(db, eventId),
    getSeatOccupancy(db, eventId),
    getVenue(db, templateId),
  ]);
  return templateUpdatePreview(eventVenue, occupancy, templateVenue, template);
}

export type ApplyTemplateResult = { status: "applied"; result: TemplateUpdateResultDto } | { status: "not-found" };

// „Zaktualizuj z szablonu”: one transaction (apply_venue_template). An event or template outside the restaurant (or a
// swapped id) → "not-found".
export async function applyVenueTemplate(
  db: DbClient,
  restaurantId: number,
  eventId: number,
  templateId: number,
): Promise<ApplyTemplateResult> {
  if (!(await getVenueTemplate(db, restaurantId, templateId))) {
    return { status: "not-found" };
  }
  const { data, error } = await db.rpc("apply_venue_template", { p_event_id: eventId, p_template_id: templateId });
  if (error) {
    if (raised(error.message, "EVENT_NOT_FOUND") || raised(error.message, "TEMPLATE_NOT_FOUND")) {
      return { status: "not-found" };
    }
    fail("zaktualizować sali z szablonu", error.message);
  }
  const counts = data as Partial<Record<keyof TemplateUpdateResultDto, unknown>> | null;
  const number = (value: unknown) => (typeof value === "number" ? value : 0);
  return {
    status: "applied",
    result: {
      seatsBefore: number(counts?.seatsBefore),
      seatsAfter: number(counts?.seatsAfter),
      roomsAdded: number(counts?.roomsAdded),
      roomsRemoved: number(counts?.roomsRemoved),
      tablesAdded: number(counts?.tablesAdded),
      tablesRemoved: number(counts?.tablesRemoved),
      tablesKept: number(counts?.tablesKept),
    },
  };
}
