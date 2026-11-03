import { defineMiddleware } from "astro:middleware";
import { decideAccess, parseAccessPath } from "@/lib/access";
import { noAccessMessages } from "@/lib/access/messages";
import { getDb } from "@/lib/db";
import { LOCALE_PARAM, isLocale, localeCookieName, resolveLocale } from "@/lib/i18n";

// Link-key guard (PRD Access Control). Every path under /o/, /tv/, /g/, /r/ and /api/{o,tv,g,r}/ needs a valid key of the
// matching role; anything else gets the same 404 "brak dostępu" response, whatever the reason (malformed, unknown or
// another role's key). A DB failure throws and becomes a 500, never a misleading 404.
//
// Language (i18n): `locals.locale` comes from the cookie of this path's area, else the path's default (the restaurant
// starts in English). A page GET with `?lang=pl|en` stores the choice and redirects to the same address without it.

const PRIVATE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

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
  const cookieName = localeCookieName(pathname);
  const requested = context.url.searchParams.get(LOCALE_PARAM);
  if (context.request.method === "GET" && !pathname.startsWith("/api/") && isLocale(requested)) {
    context.cookies.set(cookieName, requested, {
      path: "/",
      maxAge: LOCALE_COOKIE_MAX_AGE,
      sameSite: "lax",
      httpOnly: true,
      secure: context.url.protocol === "https:",
    });
    const target = new URL(context.url);
    target.searchParams.delete(LOCALE_PARAM);
    return context.redirect(`${target.pathname}${target.search}`, 303);
  }
  // A denial re-enters here as a rewrite to /404 with the same locals: keep the language of the original path.
  const rewritten = (context.locals as Partial<App.Locals>).locale;
  context.locals.locale = rewritten ?? resolveLocale(pathname, context.cookies.get(cookieName)?.value);

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
        return withPrivateHeaders(
          Response.json({ error: noAccessMessages(context.locals.locale).title }, { status: decision.status }),
        );
      }
      // Render the no-access page, but make sure the status really is 404 (a rewrite keeps the original status).
      return withPrivateHeaders(await context.rewrite("/404"), decision.status);
  }
});
