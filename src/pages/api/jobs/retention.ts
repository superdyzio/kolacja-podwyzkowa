import type { APIContext, APIRoute } from "astro";
import { noAccessMessages } from "@/lib/access/messages";
import { getDb } from "@/lib/db";
import { readBodyBytes } from "@/lib/http";
import {
  describeRetentionDryRun,
  describeRetentionJob,
  MAX_RETENTION_JOB_BODY_BYTES,
  RetentionJobBody,
  retentionTokenMatches,
  runGuestRetentionDryRun,
  runGuestRetentionJob,
} from "@/lib/privacy/job";
import { getRetentionToken } from "@/lib/retention-token";

export const prerender = false;

// The daily guest data clean-up (retention-schedule, the PR #4 review's decision 3). On AWS an EventBridge Scheduler
// schedule (`npm run deploy:aws`, kolacja-podwyzkowa-retention, every night in Europe/Warsaw) invokes the Lambda
// function with the input { job: "guest-data-retention", token }; the Lambda Web Adapter forwards such a non-HTTP event
// as a POST with the event as a JSON body (Content-Type application/json — lambda_http's pass-through request sets it —,
// so Astro's origin check lets it through without an Origin) to its pass-through path, which the deploy sets to this
// route (AWS_LWA_PASS_THROUGH_PATH). The adapter hands this route's JSON answer back to the invoker as the invocation's
// payload (a non-JSON answer, e.g. Astro's 403 text, becomes `null`; the status is dropped).
//
// The Function URL is public, so this route answers only the right RETENTION_TOKEN (constant time; hashed first): a
// missing or weak env token, a missing, wrong or malformed body, a wrong token and any other method all get the app's
// identical 404 `{"error":"Brak dostępu"}` — nothing is read from the database before the token matches. Then it purges
// every event past its restaurant's term (the guards', the sweep's and `npm run retention`'s DB functions, the server's
// clock), in batches within a 20 s budget, and answers RetentionJobResultDto — counts only, no ids or names — which is
// also its CloudWatch line. The guards, the panel's sweep and the CLI stay as fallbacks.
//
// The same body with `dryRun: true` (the deploy's self-check, one invocation shaped like the schedule's) counts what a
// run would purge and deletes nothing → RetentionDryRunResultDto `{ dryRun: true, events, complete }` and its own log
// line; it opens only for the same token. `dryRun: false` is a malformed body (the identical 404).

const PRIVATE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

function hidden(locals: APIContext["locals"]): Response {
  return Response.json({ error: noAccessMessages(locals.locale).title }, { status: 404, headers: PRIVATE_HEADERS });
}

async function readJob(request: Request): Promise<{ token: string; dryRun: boolean } | null> {
  const body = await readBodyBytes(request, MAX_RETENTION_JOB_BODY_BYTES);
  if (body.status !== "ok") {
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body.bytes));
  } catch {
    return null;
  }
  const parsed = RetentionJobBody.safeParse(data);
  return parsed.success ? { token: parsed.data.token, dryRun: parsed.data.dryRun === true } : null;
}

export const POST: APIRoute = async ({ locals, request }) => {
  const expected = getRetentionToken();
  const job = await readJob(request);
  const db = getDb();
  if (expected === null || job === null || !retentionTokenMatches(expected, job.token) || !db) {
    return hidden(locals);
  }
  if (job.dryRun) {
    const check = await runGuestRetentionDryRun(db, new Date());
    // eslint-disable-next-line no-console -- the self-check's trace in CloudWatch (counts only, nothing deleted)
    console.log(describeRetentionDryRun(check));
    return Response.json(check, { headers: PRIVATE_HEADERS });
  }
  const result = await runGuestRetentionJob(db, new Date());
  // eslint-disable-next-line no-console -- the run's trace in CloudWatch (counts only, never a name or an id)
  console.log(describeRetentionJob(result));
  return Response.json(result, { headers: PRIVATE_HEADERS });
};

export const ALL: APIRoute = ({ locals }) => hidden(locals);
