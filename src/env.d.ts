declare namespace App {
  interface Locals {
    // Set by src/middleware.ts: the access granted by the link key in the path, or null on public routes.
    access: import("@/lib/access").Access | null;
    // Set by src/middleware.ts for every request: the cookie's language, else the path's default (i18n).
    locale: import("@/lib/i18n").Locale;
    // Set by src/middleware.ts in the staff areas (staff-accounts): the logged-in person, else null (and everywhere
    // outside those areas).
    staff: import("@/lib/auth/types").StaffSession | null;
    // Set by src/middleware.ts in the staff areas (admin-support-log): the request's method (upper-case) and path, so
    // the central panel guards can admit the platform admin's support access only on reads and log what was opened.
    // Null everywhere else.
    staffRequest: { method: string; path: string } | null;
    // Set by src/middleware.ts in the per-event waiter's area (/kelner/**, /api/kelner/**; event-waiter-access): the
    // waiter of the `kp-waiter` cookie, else null (and everywhere outside that area). Never set together with `staff`.
    waiter: import("@/lib/event-waiters/types").WaiterSession | null;
  }
}
