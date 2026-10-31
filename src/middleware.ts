import { defineMiddleware } from "astro:middleware";
import { decideAccess, parseAccessPath } from "@/lib/access";
import { getDb } from "@/lib/db";

// Link-key guard (PRD Access Control). Every path under /o/, /tv/, /g/ and /api/{o,tv,g}/ needs a valid key of the
// matching role; anything else gets the same 404 "brak dostępu" response, whatever the reason (malformed, unknown or
// another role's key). A DB failure throws and becomes a 500, never a misleading 404.

const PRIVATE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

function withPrivateHeaders(response: Response, status = response.status): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(PRIVATE_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, { status, headers });
}

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.access = null;

  const { pathname } = context.url;
  if (!parseAccessPath(pathname)) {
    return next();
  }

  const decision = await decideAccess(getDb(), pathname);
  switch (decision.kind) {
    case "public":
      return next();
    case "granted":
      context.locals.access = decision.access;
      return withPrivateHeaders(await next());
    case "denied":
      if (decision.isApi) {
        return withPrivateHeaders(Response.json({ error: "Brak dostępu" }, { status: decision.status }));
      }
      // Render the no-access page, but make sure the status really is 404 (a rewrite keeps the original status).
      return withPrivateHeaders(await context.rewrite("/404"), decision.status);
  }
});
