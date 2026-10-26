import { z } from "astro/zod";
import { describe, expect, it } from "vitest";
import { INVALID_DATA_MESSAGE, jsonError, jsonResponse, parseId, readJsonBody } from "./http";

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
