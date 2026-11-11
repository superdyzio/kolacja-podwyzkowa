import { EMPTY_DIET_BOARD } from "./board";

// Support mode never sees diets (the PR #4 review, the user's decision 2): the platform administrator's logged,
// read-only visit to a restaurant (admin-support-log) shows the client's work without the guests' diets, allergies
// and notes for the kitchen — health data (GDPR art. 9), consistent with the export, which support mode never gets.
// Members (owners, managers, both kinds of waiter) keep everything. Pure.
//
// One rule for every shape a support answer or page can carry, so a later DTO with diets is covered by its key names:
// in any object, `diets` becomes [] (a guest's tags) or the empty board (DietBoardDto), `dietNote` becomes null, and
// an object holding `diets` also loses its `note` (a diet row's note: DietSeatDto, DietGuestDto, StaffSeatDto,
// GuestImportRowDto). The shapes stay valid, so the islands render „nobody has a diet”. Order lines keep their notes
// (no `diets` key next to them).
export function withoutDiets<T>(value: T): T {
  return strip(value) as T;
}

function strip(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(strip);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const holdsDiets = Object.hasOwn(value, "diets");
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "diets") {
      result[key] = Array.isArray(item) ? [] : item === null ? null : { ...EMPTY_DIET_BOARD };
    } else if (key === "dietNote" || (holdsDiets && key === "note")) {
      result[key] = null;
    } else {
      result[key] = strip(item);
    }
  }
  return result;
}

// The same for an API answer (the client's dispatcher in support mode): a JSON body is rewritten with its status and
// headers kept (no length: the body changed); anything else (images) passes through untouched.
export async function withoutDietsInResponse(response: Response): Promise<Response> {
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) {
    return response;
  }
  const body: unknown = await response.json();
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(JSON.stringify(withoutDiets(body)), { status: response.status, headers });
}
