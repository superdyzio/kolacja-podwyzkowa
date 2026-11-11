import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_ONLY_ROUTES, CLIENT_ROUTE_PATTERNS, isKeyRoute, matchClientRoute } from "./match";

// Every organizer route file, as a pattern ("guests/[id].ts" → "guests/:id"), with its exported methods.
const ROOT = join(process.cwd(), "src/pages/api/o/[key]");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? routeFiles(path) : name.endsWith(".ts") ? [path] : [];
  });
}

const routes = routeFiles(ROOT).map((file) => ({
  pattern: relative(ROOT, file)
    .replace(/\.ts$/, "")
    .replace(/\[id\]/g, ":id")
    .split("\\")
    .join("/"),
  methods: [...readFileSync(file, "utf8").matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]),
}));

describe("client routes in the panel (client-restaurant-split)", () => {
  it("covers every organizer route file except the client-only ones", () => {
    const known = new Set<string>([...CLIENT_ROUTE_PATTERNS, ...CLIENT_ONLY_ROUTES]);
    expect(routes.length).toBeGreaterThan(30);
    for (const route of routes) {
      expect(known.has(route.pattern), route.pattern).toBe(true);
      expect(route.methods.length, route.pattern).toBeGreaterThan(0);
    }
    const files = new Set(routes.map((route) => route.pattern));
    for (const pattern of CLIENT_ROUTE_PATTERNS) {
      expect(files.has(pattern), pattern).toBe(true);
    }
  });

  it("matches literal segments before :id", () => {
    expect(matchClientRoute("guests")).toEqual({ pattern: "guests", id: undefined });
    expect(matchClientRoute("guests/12")).toEqual({ pattern: "guests/:id", id: "12" });
    expect(matchClientRoute("questions/draw")).toEqual({ pattern: "questions/draw", id: undefined });
    expect(matchClientRoute("questions/7")).toEqual({ pattern: "questions/:id", id: "7" });
    expect(matchClientRoute("seating/guests/3")).toEqual({ pattern: "seating/guests/:id", id: "3" });
    expect(matchClientRoute("orders/5/pieces")).toEqual({ pattern: "orders/:id/pieces", id: "5" });
    expect(matchClientRoute("plan/image")).toEqual({ pattern: "plan/image", id: undefined });
    expect(matchClientRoute("guest-links/9/revoke")).toEqual({ pattern: "guest-links/:id/revoke", id: "9" });
  });

  it("knows nothing else", () => {
    for (const path of [undefined, "", "reset", "restaurant-link", "trial-reset", "guests/1/2", "nope", "/"]) {
      expect(matchClientRoute(path), String(path)).toBeNull();
    }
  });

  it("marks the routes with guests' link keys", () => {
    expect(isKeyRoute("guest-links")).toBe(true);
    expect(isKeyRoute("guest-links/:id/revoke")).toBe(true);
    expect(isKeyRoute("guests")).toBe(false);
  });
});
