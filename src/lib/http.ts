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

// The largest JSON body any route reads: a 100 000-character question paste, every character escaped, fits.
export const MAX_JSON_BODY_BYTES = 1_048_576;
export const TOO_LARGE_MESSAGE = "Za dużo danych naraz.";

// Reads a JSON body (never buffering more than MAX_JSON_BODY_BYTES) and validates it; malformed JSON and schema
// failures both answer 400 "Nieprawidłowe dane.", a larger body 413.
export async function readJsonBody<S extends z.ZodType>(request: Request, schema: S): Promise<BodyResult<z.output<S>>> {
  const body = await readBodyBytes(request, MAX_JSON_BODY_BYTES);
  if (body.status === "too-large") {
    return { ok: false, response: jsonError(413, TOO_LARGE_MESSAGE) };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(body.status === "ok" ? new TextDecoder().decode(body.bytes) : "");
  } catch {
    return { ok: false, response: jsonError(400, INVALID_DATA_MESSAGE) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: jsonError(400, INVALID_DATA_MESSAGE) };
  }
  return { ok: true, data: parsed.data };
}

export type BodyBytesResult =
  { status: "ok"; bytes: Uint8Array<ArrayBuffer> } | { status: "empty" } | { status: "too-large" };

// Reads a raw upload (e.g. an image sent as the request body) without ever buffering more than `limit` bytes:
// a declared Content-Length above the limit is refused before reading, and the stream is cancelled as soon as the
// running total passes the limit (the header can be missing or wrong).
export async function readBodyBytes(request: Request, limit: number): Promise<BodyBytesResult> {
  const declared = Number(request.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declared) && declared > limit) {
    return { status: "too-large" };
  }
  if (!request.body) {
    return { status: "empty" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return { status: "too-large" };
    }
    chunks.push(value);
  }
  if (total === 0) {
    return { status: "empty" };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { status: "ok", bytes };
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
