import type { z } from "astro/zod";

// JSON helpers for API routes (pure, no `astro:*` runtime imports). Error bodies are `{ "error": "<Polish message>" }`
// plus optional details; the island shows `error` as is.

export const INVALID_DATA_MESSAGE = "Nieprawidłowe dane.";

export function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function jsonError(status: number, message: string, extra: Record<string, unknown> = {}): Response {
  return Response.json({ error: message, ...extra }, { status });
}

export type BodyResult<T> = { ok: true; data: T } | { ok: false; response: Response };

// Reads a JSON body and validates it; malformed JSON and schema failures both answer 400 "Nieprawidłowe dane."
export async function readJsonBody<S extends z.ZodType>(request: Request, schema: S): Promise<BodyResult<z.output<S>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: jsonError(400, INVALID_DATA_MESSAGE) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: jsonError(400, INVALID_DATA_MESSAGE) };
  }
  return { ok: true, data: parsed.data };
}

const ID_PATTERN = /^[1-9][0-9]{0,15}$/;

// A route id parameter as a positive safe integer, or null (→ the route answers "not found").
export function parseId(param: string | undefined): number | null {
  if (param === undefined || !ID_PATTERN.test(param)) {
    return null;
  }
  const id = Number(param);
  return Number.isSafeInteger(id) ? id : null;
}
