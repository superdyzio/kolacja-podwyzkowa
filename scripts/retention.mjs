// Deletes the guests' data of every event past its restaurant's retention term (privacy-retention, S-26; PRD v2
// FR-040, NFR-019) — the same DB functions the app runs before serving an expired event, on panel page views and in
// the daily clean-up on AWS (retention-schedule: an EventBridge Scheduler schedule of `npm run deploy:aws` → POST
// /api/jobs/retention). This command is the manual fallback (a local database, or a hosted one with --remote). Never
// touches venue templates, events inside their term (the noon window after the event included), staff accounts or the
// administrator's support log.
//
// Works against the database of .env (or the SUPABASE_* variables given on the command line) and prints its host
// first; a non-local database needs --remote, and there the run stops unless this machine's clock agrees with the
// server's within MAX_CLOCK_SKEW_MS (the term is decided by the time this script sends).
//
// Usage: npm run retention -- [--dry-run] [--restaurant-id <id>] [--limit <n>] [--remote]

import { parseArgs } from "node:util";
import { clockSkewProblem, PlatformError, purgeExpiredGuestData, readDbEnv, serverClockSkew } from "./lib/platform.mjs";

const USAGE = "Użycie: npm run retention -- [--dry-run] [--restaurant-id <id>] [--limit <liczba>] [--remote]";

function fail(message) {
  console.error(message);
  process.exit(1);
}

let parsed;
try {
  parsed = parseArgs({
    options: {
      "dry-run": { type: "boolean" },
      "restaurant-id": { type: "string" },
      limit: { type: "string" },
      remote: { type: "boolean" },
    },
    allowPositionals: false,
    strict: true,
  });
} catch (error) {
  fail(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
}

const options = parsed.values;
const positiveInt = (text, label) => {
  if (text === undefined) {
    return null;
  }
  const value = Number(text);
  if (!Number.isInteger(value) || value < 1 || value > 2_147_483_647) {
    fail(`${label}: podaj dodatnią liczbę całkowitą.\n${USAGE}`);
  }
  return value;
};
const restaurantId = positiveInt(options["restaurant-id"], "--restaurant-id");
const limit = positiveInt(options.limit, "--limit") ?? 1000;
const dryRun = options["dry-run"] === true;

try {
  const env = readDbEnv();
  console.log(`Baza: ${env.host}`);
  if (!env.local && !options.remote) {
    fail("To nie jest lokalna baza. Jeśli naprawdę chcesz usunąć dane gości w tej bazie, dodaj --remote.");
  }
  if (!env.local) {
    // The database re-checks the term with the time this script sends: a hosted run trusts this machine's clock only
    // when it agrees with the server's.
    const problem = clockSkewProblem(await serverClockSkew(env));
    if (problem) {
      fail(problem);
    }
  }
  const now = new Date();
  const events = await purgeExpiredGuestData(env, { restaurantId, limit, dryRun, now });
  if (events.length === 0) {
    console.log("Brak wydarzeń po terminie z danymi gości — nic do usunięcia.");
    process.exit(0);
  }
  console.log(
    dryRun
      ? `Wydarzenia po terminie z danymi gości (podgląd, nic nie usunięto): ${String(events.length)}`
      : `Usunięto dane gości wydarzeń po terminie: ${String(events.length)}`,
  );
  let guests = 0;
  for (const event of events) {
    const line = `- ${event.restaurant} · ${event.name} (id ${String(event.id)}, ${event.date})`;
    if (!event.result) {
      console.log(line);
      continue;
    }
    const { status } = event.result;
    const count = (key) => Number(event.result[key] ?? 0);
    guests += count("guests");
    console.log(
      status === "purged"
        ? `${line}: goście ${String(count("guests"))}, grupy ${String(count("groups"))}, rozsadzenia ${String(count("snapshots"))}, ekran TV ${String(count("spotlight"))}, kelnerzy ${String(count("waiters"))}, uwagi zamówień ${String(count("notes"))}`
        : `${line}: ${status === "kept" ? "jeszcze w terminie (pominięte)" : status === "clean" ? "już czyste" : "nie znaleziono"}`,
    );
  }
  if (!dryRun) {
    console.log(`Razem usuniętych gości: ${String(guests)}`);
  }
} catch (error) {
  fail(error instanceof PlatformError ? error.message : String(error));
}
