import { z } from "astro/zod";
import { describe, expect, it } from "vitest";
import {
  INVALID_DATA_MESSAGE,
  jsonError,
  jsonResponse,
  MAX_JSON_BODY_BYTES,
  parseId,
  readBodyBytes,
  readJsonBody,
  TOO_LARGE_MESSAGE,
} from "./http";

const schema = z.strictObject({ text: z.string() });

function post(body: string): Request {
  return new Request("http://localhost/api", { method: "POST", body, headers: { "Content-Type": "application/json" } });
}

describe("readJsonBody", () => {
  it("returns the validated data", async () => {
    expect(await readJsonBody(post('{"text":"Ania"}'), schema)).toEqual({ ok: true, data: { text: "Ania" } });
  });

  it.each(["", "{", "null", '{"text":1}', '{"text":"Ania","groupId":3}', "[]"])("answers 400 for %j", async (body) => {
    const result = await readJsonBody(post(body), schema);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toEqual({ error: INVALID_DATA_MESSAGE });
  });

  it("reads Polish text and refuses a body over the limit with 413", async () => {
    expect(await readJsonBody(post('{"text":"Zażółć gęślą jaźń"}'), schema)).toEqual({
      ok: true,
      data: { text: "Zażółć gęślą jaźń" },
    });
    const result = await readJsonBody(post(JSON.stringify({ text: "a".repeat(MAX_JSON_BODY_BYTES) })), schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(413);
      expect(await result.response.json()).toEqual({ error: TOO_LARGE_MESSAGE });
    }
  });
});

describe("JSON responses", () => {
  it("builds error bodies with optional details", async () => {
    const response = jsonError(409, "Już jest.", { names: ["Ania"] });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Już jest.", names: ["Ania"] });
  });

  it("builds data responses", async () => {
    const response = jsonResponse({ guests: [] }, 201);
    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ guests: [] });
  });
});

describe("parseId", () => {
  it("accepts positive integers", () => {
    expect(parseId("1")).toBe(1);
    expect(parseId("123456")).toBe(123456);
  });

  it.each([undefined, "", "0", "-1", "1.5", "1e3", "abc", "01", " 1", "99999999999999999"])("rejects %j", (param) => {
    expect(parseId(param)).toBeNull();
  });
});

describe("readBodyBytes", () => {
  const LIMIT = 10;

  function put(body: BodyInit | null, headers: Record<string, string> = {}): Request {
    return new Request("http://localhost/api/plan", { method: "PUT", body, headers });
  }

  // A body streamed in chunks, without a Content-Length.
  function streamed(...chunks: number[][]): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new Uint8Array(chunk));
        }
        controller.close();
      },
    });
  }

  function streamedPut(stream: ReadableStream<Uint8Array>): Request {
    return new Request("http://localhost/api/plan", { method: "PUT", body: stream, duplex: "half" } as RequestInit);
  }

  it("reads a body under or at the limit", async () => {
    expect(await readBodyBytes(put(new Uint8Array([1, 2, 3])), LIMIT)).toEqual({
      status: "ok",
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(await readBodyBytes(put(new Uint8Array(LIMIT).fill(7)), LIMIT)).toEqual({
      status: "ok",
      bytes: new Uint8Array(LIMIT).fill(7),
    });
  });

  it("joins streamed chunks without a Content-Length", async () => {
    expect(await readBodyBytes(streamedPut(streamed([1, 2], [3], [4, 5, 6])), LIMIT)).toEqual({
      status: "ok",
      bytes: new Uint8Array([1, 2, 3, 4, 5, 6]),
    });
  });

  it("refuses a body over the limit", async () => {
    expect(await readBodyBytes(put(new Uint8Array(LIMIT + 1)), LIMIT)).toEqual({ status: "too-large" });
  });

  it("stops reading a stream as soon as it passes the limit", async () => {
    const stream = streamed([1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11], [12]);
    expect(await readBodyBytes(streamedPut(stream), LIMIT)).toEqual({ status: "too-large" });
  });

  it("refuses a declared Content-Length over the limit without reading", async () => {
    const request = put(new Uint8Array([1]), { "Content-Length": String(LIMIT + 1) });
    if (request.headers.get("content-length") === null) {
      // The runtime dropped the header (forbidden in some fetch implementations); nothing to check here.
      return;
    }
    expect(await readBodyBytes(request, LIMIT)).toEqual({ status: "too-large" });
    expect(request.bodyUsed).toBe(false);
  });

  it("does not trust a Content-Length that is too small", async () => {
    const request = put(new Uint8Array(LIMIT + 5), { "Content-Length": "1" });
    expect(await readBodyBytes(request, LIMIT)).toEqual({ status: "too-large" });
  });

  it("reports an empty body", async () => {
    expect(await readBodyBytes(put(null), LIMIT)).toEqual({ status: "empty" });
    expect(await readBodyBytes(put(new Uint8Array()), LIMIT)).toEqual({ status: "empty" });
  });
});
