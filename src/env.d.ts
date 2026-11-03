declare namespace App {
  interface Locals {
    // Set by src/middleware.ts: the access granted by the link key in the path, or null on public routes.
    access: import("@/lib/access").Access | null;
    // Set by src/middleware.ts for every request: the cookie's language, else the path's default (i18n).
    locale: import("@/lib/i18n").Locale;
  }
}
