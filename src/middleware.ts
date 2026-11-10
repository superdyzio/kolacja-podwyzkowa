import { defineMiddleware } from "astro:middleware";
import type { APIContext, MiddlewareNext } from "astro";
import { decideAccess, parseAccessPath, type Access } from "@/lib/access";
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
import {
  classifyWaiterPath,
  clearedWaiterCookie,
  eventWaiterMessages,
  getWaiterSession,
  readWaiterToken,
  WAITER_COOKIE,
  WAITER_ENTRY_PATH,
  type WaiterArea,
} from "@/lib/event-waiters";
import { LOCALE_PARAM, isLocale, localeCookieName, resolveLocale } from "@/lib/i18n";
import { clientMayWrite, isOrganizerApiPath, LEAD_CODES, leadMessages } from "@/lib/lead";
import { keyedApiSubPath, MODULE_CODES, moduleForApiPath, modulesMessages, type ModuleKey } from "@/lib/modules";

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
// login page with a session → 303 to the panel. `locals.staffRequest` (method, path) lets the central panel guards
// admit the platform admin's support access only on reads and log what was opened (admin-support-log, S-13).
//
// The per-event waiter (event-waiter-access, S-21b; src/lib/event-waiters/paths.ts): /kelner/** and /api/kelner/** are
// an area of their own. Every mutation under /api/kelner/ must carry a same-origin Origin header (else 403, before any
// DB read); only the waiter cookie `kp-waiter` is read there (`locals.waiter`; `locals.staff` stays null) and only the
// staff cookie in the staff areas, so neither door ever opens the other. /kelner/sala/** without a waiter session →
// 303 to the entry page, /api/kelner/sala/** → 401 with one fixed body; a waiter cookie that opens nothing is cleared on
// those answers.
//
// „Lokal prowadzi” (client-restaurant-split, S-14): while the restaurant's staff lead the event, the organizer link is
// view-only — every non-safe method under /api/o/<key>/ gets a 409 with `code: "venue-leads"` before the route runs.
// Reads, pages, the guests', the TV's and the tablet's links are never affected.

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

  locals.staffRequest = { method: request.method.toUpperCase(), path: url.pathname };

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

async function guardWaiterArea(context: APIContext, next: MiddlewareNext, area: WaiterArea): Promise<Response> {
  const { request, url, locals } = context;
  if (
    (area === "waiter-api" || area === "waiter-floor-api") &&
    isMutation(request.method) &&
    !isSameOrigin(request.headers.get("origin"), url.origin)
  ) {
    return withHeaders(
      Response.json({ error: authMessages(locals.locale).forbiddenOrigin }, { status: 403 }),
      AUTH_AREA_HEADERS,
    );
  }

  const cookieHeader = request.headers.get("cookie");
  const token = readWaiterToken(cookieHeader);
  const db = getDb();
  locals.waiter = db && token ? await getWaiterSession(db, token) : null;

  const stale = !locals.waiter && (cookieHeader ?? "").includes(`${WAITER_COOKIE}=`);
  const clearing: Record<string, string> = stale
    ? { "Set-Cookie": clearedWaiterCookie({ secure: url.protocol === "https:" }) }
    : {};

  if (!locals.waiter && area === "waiter-floor") {
    return withHeaders(
      new Response(null, { status: 303, headers: { Location: WAITER_ENTRY_PATH, ...clearing } }),
      AUTH_AREA_HEADERS,
    );
  }
  if (!locals.waiter && area === "waiter-floor-api") {
    return withHeaders(
      Response.json({ error: eventWaiterMessages(locals.locale).noSession }, { status: 401, headers: clearing }),
      AUTH_AREA_HEADERS,
    );
  }
  return withHeaders(await next(), AUTH_AREA_HEADERS);
}

// The module an API request of a key route needs when that module is off in the event, else null (event-modules).
function offModuleOf(pathname: string, access: Access): { role: "organizer" | "guest"; module: ModuleKey } | null {
  const keyed = keyedApiSubPath(pathname);
  if (keyed?.role !== access.role) {
    return null;
  }
  const module = moduleForApiPath(keyed.role, keyed.subPath);
  return module && !access.event.modules[module] ? { role: keyed.role, module } : null;
}

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.access = null;
  context.locals.staff = null;
  context.locals.staffRequest = null;
  context.locals.waiter = null;

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
  const waiterArea = classifyWaiterPath(pathname);
  if (waiterArea) {
    return guardWaiterArea(context, next, waiterArea);
  }

  if (!parseAccessPath(pathname)) {
    return next();
  }

  const decision = await decideAccess(getDb(), pathname);
  switch (decision.kind) {
    case "public":
      return next();
    case "granted": {
      context.locals.access = decision.access;
      // event-modules (S-17): an off module's API refuses before the route runs — the organizer link with a 409
      // `module-off` (its islands and the offline copy tell it from a revoked key), a guest with the identical denial
      // of a wrong key. Before the lead rule: an off module is off whoever leads.
      const offModule = offModuleOf(pathname, decision.access);
      if (offModule) {
        return withPrivateHeaders(
          offModule.role === "organizer"
            ? Response.json(
                { error: modulesMessages(context.locals.locale).off, code: MODULE_CODES.off, module: offModule.module },
                { status: 409 },
              )
            : Response.json({ error: noAccessMessages(context.locals.locale).title }, { status: 404 }),
        );
      }
      if (
        decision.access.role === "organizer" &&
        !clientMayWrite(decision.access.event.venueLeads) &&
        isOrganizerApiPath(pathname) &&
        isMutation(context.request.method)
      ) {
        return withPrivateHeaders(
          Response.json(
            { error: leadMessages(context.locals.locale).clientReadOnly, code: LEAD_CODES.venueLeads },
            { status: 409 },
          ),
        );
      }
      return withPrivateHeaders(await next());
    }
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
