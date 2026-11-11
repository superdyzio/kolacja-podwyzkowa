// The app's languages (i18n). Polish is the default everywhere except the restaurant's link: most of the kitchen staff
// do not speak Polish, so /r/<key> starts in English. The choice is a cookie (one for the restaurant, one for every
// other page, so an organizer's choice never flips the restaurant's tablet and vice versa), set by `?lang=pl|en`
// (the switch in the page corner). Pure: shared by the middleware, pages and islands.

export const LOCALES = ["pl", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "pl";

// The query parameter of the language switch.
export const LOCALE_PARAM = "lang";

// How long the language cookie keeps the choice: one year (also stated in the privacy policy draft, landing-legal).
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const RESTAURANT_PATH = /^\/(api\/)?r(\/|$)/;

export function isLocale(value: unknown): value is Locale {
  return value === "pl" || value === "en";
}

function isRestaurantPath(pathname: string): boolean {
  return RESTAURANT_PATH.test(pathname);
}

// The cookie that keeps the choice for this path. Decided by the path prefix only, never by whether the key is valid:
// a denial must not depend on the key.
export function localeCookieName(pathname: string): string {
  return isRestaurantPath(pathname) ? "kp-lang-r" : "kp-lang";
}

export function defaultLocaleFor(pathname: string): Locale {
  return isRestaurantPath(pathname) ? "en" : DEFAULT_LOCALE;
}

export function resolveLocale(pathname: string, cookieValue: string | undefined): Locale {
  return isLocale(cookieValue) ? cookieValue : defaultLocaleFor(pathname);
}

// Where the language switch redirects: the request's own path and query (without `?lang=`), always as a same-origin
// path. Astro already hands the middleware a normalized pathname (decoded, duplicate slashes collapsed), but this is
// the one place a request path is echoed into a Location header, so leading slashes, backslashes and whitespace are
// collapsed here too: `//evil.com/` or `/\evil.com/` would be a scheme-relative address on another host. Never decode
// the path here (`/%2F%2Fevil.com/` stays an encoded, same-origin path).
export function localeSwitchTarget(pathname: string, search: string): string {
  return `/${pathname.replace(/^[\s/\\]+/, "")}${search}`;
}

// Picks this locale's entry of a { pl, en } dictionary. `en` must have the same shape as `pl` (a missing key or a
// function with other parameters is a type error), so no text can be forgotten in one language.
export function defineMessages<T>(pl: T, en: NoInfer<T>): (locale?: Locale) => T {
  const byLocale: Record<Locale, T> = { pl, en };
  return (locale = DEFAULT_LOCALE) => byLocale[locale];
}

// The language names on the switch, each in its own language.
export const LOCALE_LABELS: Record<Locale, string> = { pl: "Polski", en: "English" };
