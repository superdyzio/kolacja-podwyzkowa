import { defineMiddleware } from "astro:middleware";
import type { APIContext, MiddlewareNext } from "astro";
import { decideAccess, parseAccessPath } from "@/lib/access";
import { noAccessMessages } from "@/lib/access/messages";
import {
  AUTH_AREA_HEADERS,
  authMessages,
  classifyAuthPath,
  clearedSessionCookie,
  getSession,
  isMutation,
  isSameOrigin,
  LOGIN_PATH,
  PANEL_PATH,
  readSessionToken,
  SESSION_COOKIE,
  type AuthArea,
} from "@/lib/auth";
import { getDb } from "@/lib/db";
import { LOCALE_PARAM, isLocale, localeCookieName, resolveLocale } from "@/lib/i18n";

// Link-key guard (PRD Access Control). Every path under /o/, /tv/, /g/, /r/ and /api/{o,tv,g,r}/ needs a valid key of the
// matching role; anything else gets the same 404 "brak dostępu" response, whatever the reason (malformed, unknown or
// another role's key). A DB failure throws and becomes a 500, never a misleading 404.
//
// Language (i18n): `locals.locale` comes from the cookie of this path's area, else the path's default (the restaurant
// starts in English). A page GET with `?lang=pl|en` stores the choice and redirects to the same address without it.
//
// Staff areas (staff-accounts, F-03; src/lib/auth/paths.ts): every mutation under /api/panel/ and /api/auth/ must carry
// a same-origin Origin header (else 403, before any DB read); the session cookie sets `locals.staff`; /panel/ without a
// session → 303 to the login page, /api/panel/ without one → 401 with one fixed body (whatever the cookie was). The
// login page with a session → 303 to the panel.

const PRIVATE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function withHeaders(response: Response, extra: Readonly<Record<string, string>>, status = response.status): Response {
  // Rebuilt (some responses have immutable headers); Set-Cookie headers of the route are kept one by one.
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(extra)) {
    headers.set(name, value);
  }
  return new Response(response.body, { status, headers });
}

function withPrivateHeaders(response: Response, status = response.status): Response {
  return withHeaders(response, PRIVATE_HEADERS, status);
}

async function guardStaffArea(context: APIContext, next: MiddlewareNext, area: AuthArea): Promise<Response> {
  const { request, url, locals } = context;
  const t = authMessages(locals.locale);
  const isApi = area === "panel-api" || area === "auth-api";
  if (isApi && isMutation(request.method) && !isSameOrigin(request.headers.get("origin"), url.origin)) {
    return withHeaders(Response.json({ error: t.forbiddenOrigin }, { status: 403 }), AUTH_AREA_HEADERS);
  }

  const cookieHeader = request.headers.get("cookie");
  const token = readSessionToken(cookieHeader);
  const db = getDb();
  locals.staff = db && token ? await getSession(db, token) : null;

  // A session cookie that no longer opens anything is cleared on the answers this guard gives itself.
  const stale = !locals.staff && (cookieHeader ?? "").includes(`${SESSION_COOKIE}=`);
  const clearing: Record<string, string> = stale
    ? { "Set-Cookie": clearedSessionCookie({ secure: url.protocol === "https:" }) }
    : {};

  if (!locals.staff && area === "panel") {
    return withHeaders(
      new Response(null, { status: 303, headers: { Location: LOGIN_PATH, ...clearing } }),
      AUTH_AREA_HEADERS,
    );
  }
  if (!locals.staff && area === "panel-api") {
    return withHeaders(Response.json({ error: t.noSession }, { status: 401, headers: clearing }), AUTH_AREA_HEADERS);
  }
  if (locals.staff && area === "auth-page" && url.pathname.replace(/\/$/, "") === LOGIN_PATH) {
    return withHeaders(new Response(null, { status: 303, headers: { Location: PANEL_PATH } }), AUTH_AREA_HEADERS);
  }
  return withHeaders(await next(), AUTH_AREA_HEADERS);
}

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.access = null;
  context.locals.staff = null;

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

  const staffArea = classifyAuthPath(pathname);
  if (staffArea) {
    return guardStaffArea(context, next, staffArea);
  }

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
