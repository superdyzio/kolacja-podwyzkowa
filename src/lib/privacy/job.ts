import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "astro/zod";
import type { DbClient } from "@/lib/supabase-client";
import type { PurgeResultDto, RetentionDryRunResultDto, RetentionJobResultDto } from "@/types";
import { listExpiredGuestDataEvents, purgeEventGuestData } from "./service";

// The daily guest data clean-up (retention-schedule, the PR #4 review's decision 3). On AWS an EventBridge Scheduler
// schedule invokes the Lambda function once a day with a JSON input; the Lambda Web Adapter forwards that non-HTTP
// event as a POST to its pass-through path (AWS_LWA_PASS_THROUGH_PATH, set by `npm run deploy:aws` to
// RETENTION_JOB_PATH). The route there runs this job: every event past its restaurant's term loses its guests' data
// (the same DB functions as the guards, the panel's sweep and `npm run retention`), in batches within a time budget
// well under the Lambda timeout. The Function URL is public, so the route opens only for the secret RETENTION_TOKEN
// (in the function's environment and in the schedule's input), compared in constant time; anything else gets the
// app's identical 404. Server only (node:crypto).
//
// The self-check (the PR #4 review's second round): the same body with `dryRun: true` only counts what a run would
// purge (one `expired_guest_data_events` read, no `purge_event_guest_data`, nothing deleted) and answers
// RetentionDryRunResultDto. `npm run deploy:aws` invokes the function once with it, exactly the way the schedule does,
// so a deploy proves the whole path (the adapter's POST, Astro's origin check, the token) without deleting anything.

// The route's path (src/pages/api/jobs/retention.ts) and the schedule input's `job` (scripts/lib/aws-deploy.mjs keeps
// the same values; tests/scripts/aws-deploy.test.ts compares them).
export const RETENTION_JOB_PATH = "/api/jobs/retention";
export const RETENTION_JOB_NAME = "guest-data-retention";

// A shorter token (or none) keeps the route closed: a weak secret must not open a public URL.
export const MIN_RETENTION_TOKEN_LENGTH = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9+/=_-]+$/;

// The schedule's input is a few dozen bytes; anything larger is refused unread.
export const MAX_RETENTION_JOB_BODY_BYTES = 4096;

// Stop starting new purges after this long (one purge takes well under a second; Lambda stops at 30 s), and list the
// events in batches of this many. What is left waits for the next run (or the guards and the panel's sweep).
export const RETENTION_JOB_BUDGET_MS = 20_000;
export const RETENTION_JOB_BATCH = 25;

// How many expired events a dry run counts at most (one read of ids that never leave the server).
export const RETENTION_DRY_RUN_LIMIT = 1000;

// The schedule's input, exactly: { job, token } and nothing else — or the deploy's self-check { job, token, dryRun:
// true }. `dryRun: false` is not a way to ask for a real run (the schedule never sends the field): like any other odd
// body it gets the identical 404.
export const RetentionJobBody = z
  .object({
    job: z.literal(RETENTION_JOB_NAME),
    token: z.string().min(1).max(512),
    dryRun: z.literal(true).optional(),
  })
  .strict();

// The configured token when it is usable (long enough, base64 / hex characters only), else null (the route stays shut).
export function usableRetentionToken(value: string | null | undefined): string | null {
  return typeof value === "string" && value.length >= MIN_RETENTION_TOKEN_LENGTH && TOKEN_PATTERN.test(value)
    ? value
    : null;
}

function digest(text: string): Buffer {
  return createHash("sha256").update(text, "utf8").digest();
}

// Constant time whatever the lengths (both sides hashed first); false without a configured token.
export function retentionTokenMatches(expected: string | null, given: string): boolean {
  if (expected === null) {
    return false;
  }
  return timingSafeEqual(digest(expected), digest(given));
}

// One run: list the expired events (oldest first, `batch` at a time), purge each (one transaction each), until none is
// left or the budget is spent. An id listed again after its purge (nothing to do there) is not purged twice; when a
// whole batch is such ids, the run stops. `complete` = nothing was left when it stopped. Counts only — no ids or names.
export async function runRetentionBatches(
  steps: { list: (limit: number) => Promise<number[]>; purge: (eventId: number) => Promise<PurgeResultDto> },
  options: { batch: number; budgetMs: number; elapsedMs: () => number },
): Promise<RetentionJobResultDto> {
  const result: RetentionJobResultDto = {
    events: 0,
    guests: 0,
    groups: 0,
    snapshots: 0,
    spotlight: 0,
    waiters: 0,
    notes: 0,
    skipped: 0,
    complete: false,
  };
  const seen = new Set<number>();
  for (;;) {
    if (options.elapsedMs() >= options.budgetMs) {
      return result;
    }
    const listed = await steps.list(options.batch);
    const fresh = listed.filter((id) => !seen.has(id));
    if (fresh.length === 0) {
      result.complete = listed.length < options.batch;
      return result;
    }
    for (const id of fresh) {
      if (options.elapsedMs() >= options.budgetMs) {
        return result;
      }
      seen.add(id);
      const purged = await steps.purge(id);
      if (purged.status !== "purged") {
        result.skipped += 1;
        continue;
      }
      result.events += 1;
      result.guests += purged.guests;
      result.groups += purged.groups;
      result.snapshots += purged.snapshots;
      result.spotlight += purged.spotlight;
      result.waiters += purged.waiters;
      result.notes += purged.notes;
    }
  }
}

// The log line of a run (CloudWatch): counts only.
export function describeRetentionJob(result: RetentionJobResultDto): string {
  return (
    `Retencja danych gości (codzienne sprzątanie): wydarzenia ${String(result.events)}, goście ${String(result.guests)}, ` +
    `grupy ${String(result.groups)}, rozsadzenia ${String(result.snapshots)}, ekran TV ${String(result.spotlight)}, ` +
    `kelnerzy ${String(result.waiters)}, uwagi zamówień ${String(result.notes)}, pominięte ${String(result.skipped)}, ` +
    (result.complete ? "wszystko" : "zostały kolejne (następny przebieg)")
  );
}

// The self-check: how many events a run would purge now (listed oldest first, at most `limit`; `complete` = the count is
// exact, i.e. fewer than `limit + 1` were listed). Purges nothing. Counts only — no ids or names.
export async function runRetentionDryRun(
  steps: { list: (limit: number) => Promise<number[]> },
  limit: number = RETENTION_DRY_RUN_LIMIT,
): Promise<RetentionDryRunResultDto> {
  const listed = await steps.list(limit + 1);
  return { dryRun: true, events: Math.min(listed.length, limit), complete: listed.length <= limit };
}

// The self-check's log line (CloudWatch): counts only, and plainly not a nightly run.
export function describeRetentionDryRun(result: RetentionDryRunResultDto): string {
  return (
    `Retencja danych gości (sprawdzenie bez usuwania, dryRun): po terminie wydarzenia ${String(result.events)}` +
    `${result.complete ? "" : " lub więcej"}, nic nie usunięto`
  );
}

// The route's run against the database with the server's clock: every restaurant (switched-off ones too — retention
// does not pause), templates never (the DB functions exclude them). `restaurantId` narrows it for tests only.
export async function runGuestRetentionJob(
  db: DbClient,
  now: Date,
  options: { restaurantId?: number; budgetMs?: number; batch?: number; elapsedMs?: () => number } = {},
): Promise<RetentionJobResultDto> {
  const started = Date.now();
  return runRetentionBatches(
    {
      list: (limit) => listExpiredGuestDataEvents(db, now, { restaurantId: options.restaurantId ?? null, limit }),
      purge: (eventId) => purgeEventGuestData(db, eventId, now),
    },
    {
      batch: options.batch ?? RETENTION_JOB_BATCH,
      budgetMs: options.budgetMs ?? RETENTION_JOB_BUDGET_MS,
      elapsedMs: options.elapsedMs ?? (() => Date.now() - started),
    },
  );
}

// The route's self-check against the database with the server's clock: what tonight's run would purge, nothing deleted.
export async function runGuestRetentionDryRun(
  db: DbClient,
  now: Date,
  options: { restaurantId?: number; limit?: number } = {},
): Promise<RetentionDryRunResultDto> {
  return runRetentionDryRun(
    { list: (limit) => listExpiredGuestDataEvents(db, now, { restaurantId: options.restaurantId ?? null, limit }) },
    options.limit ?? RETENTION_DRY_RUN_LIMIT,
  );
}
