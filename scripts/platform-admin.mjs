// Creates (or finds) a platform administrator account and prints a one-time link for setting its password
// (staff-accounts, F-03). The app never sends e-mail: hand the link over yourself. An account without a password gets
// an invitation link (7 days), an account with one gets a password-reset link (24 hours) — the way back in for an
// administrator who lost the password. Every run replaces the account's earlier unused links.
//
// Works against the database of .env (or the SUPABASE_* variables given on the command line) and prints its host
// first; a non-local database needs --remote, so a production admin is never created by accident. The link is
// secret: do not paste the output anywhere public.
//
// Usage: npm run platform:admin -- <email> [--name "<name>"] [--remote]
//        BASE_URL=https://twoja-domena SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run platform:admin -- ja@example.com --remote

import { parseArgs } from "node:util";
import { ensureStaffAccount, issueStaffLink, normalizeStaffEmail, PlatformError, readDbEnv } from "./lib/platform.mjs";

const USAGE = 'Użycie: npm run platform:admin -- <email> [--name "<imię i nazwisko>"] [--remote]';
const baseUrl = process.env.BASE_URL ?? "http://localhost:4321";

function fail(message) {
  console.error(message);
  process.exit(1);
}

let parsed;
try {
  parsed = parseArgs({
    options: { name: { type: "string" }, remote: { type: "boolean" } },
    allowPositionals: true,
    strict: true,
  });
} catch (error) {
  fail(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
}

const { values: options, positionals } = parsed;
if (positionals.length !== 1) {
  fail(USAGE);
}
const email = normalizeStaffEmail(positionals[0]);
if (!email) {
  fail(`To nie wygląda na adres e-mail: ${positionals[0]}\n${USAGE}`);
}
const name = options.name?.trim() || null;
if (name !== null && name.length > 80) {
  fail("Imię i nazwisko: najwyżej 80 znaków.");
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

try {
  const env = readDbEnv();
  console.log(`Baza: ${env.host}`);
  if (!env.local && !options.remote) {
    fail(
      "To nie jest lokalna baza. Jeśli naprawdę chcesz założyć administratora platformy w tej bazie, dodaj --remote.",
    );
  }
  const account = await ensureStaffAccount(env, { email, displayName: name, isPlatformAdmin: true });
  const kind = account.hasPassword ? "reset" : "invite";
  const link = await issueStaffLink(env, account.id, kind, baseUrl);
  console.log(
    `Administrator platformy: ${account.email} (${account.created ? "nowe konto" : "istniejące konto"}, id ${String(account.id)})`,
  );
  console.log(
    `${kind === "invite" ? "Link zaproszenia" : "Link do ustawienia nowego hasła"} (jednorazowy, ważny do ${formatDate(link.expiresAt)}):`,
  );
  console.log(`  ${link.url}`);
  console.log("Przekaż go tylko tej osobie. Kolejne uruchomienie unieważni ten link.");
} catch (error) {
  fail(error instanceof PlatformError ? error.message : String(error));
}
