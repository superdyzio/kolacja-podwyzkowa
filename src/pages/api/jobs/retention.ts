import type { APIContext, APIRoute } from "astro";
import { noAccessMessages } from "@/lib/access/messages";
import { getDb } from "@/lib/db";
import { readBodyBytes } from "@/lib/http";
import {
  describeRetentionJob,
  MAX_RETENTION_JOB_BODY_BYTES,
  RetentionJobBody,
  retentionTokenMatches,
  runGuestRetentionJob,
} from "@/lib/privacy/job";
import { getRetentionToken } from "@/lib/retention-token";

export const prerender = false;

// The daily guest data clean-up (retention-schedule, the PR #4 review's decision 3). On AWS an EventBridge Scheduler
// schedule (`npm run deploy:aws`, kolacja-podwyzkowa-retention, every night in Europe/Warsaw) invokes the Lambda
// function with the input { job: "guest-data-retention", token }; the Lambda Web Adapter forwards such a non-HTTP event
// as a POST with the event as a JSON body (Content-Type application/json, so Astro's origin check lets it through
// without an Origin) to its pass-through path, which the deploy sets to this route (AWS_LWA_PASS_THROUGH_PATH).
//
// The Function URL is public, so this route answers only the right RETENTION_TOKEN (constant time; hashed first): a
// missing or weak env token, a missing, wrong or malformed body, a wrong token and any other method all get the app's
// identical 404 `{"error":"Brak dostępu"}` — nothing is read from the database before the token matches. Then it purges
// every event past its restaurant's term (the guards', the sweep's and `npm run retention`'s DB functions, the server's
// clock), in batches within a 20 s budget, and answers RetentionJobResultDto — counts only, no ids or names — which is
// also its CloudWatch line. The guards, the panel's sweep and the CLI stay as fallbacks.

const PRIVATE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

function hidden(locals: APIContext["locals"]): Response {
  return Response.json({ error: noAccessMessages(locals.locale).title }, { status: 404, headers: PRIVATE_HEADERS });
}

async function readToken(request: Request): Promise<string | null> {
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
  return parsed.success ? parsed.data.token : null;
}

export const POST: APIRoute = async ({ locals, request }) => {
  const expected = getRetentionToken();
  const given = await readToken(request);
  const db = getDb();
  if (expected === null || given === null || !retentionTokenMatches(expected, given) || !db) {
    return hidden(locals);
  }
  const result = await runGuestRetentionJob(db, new Date());
  // eslint-disable-next-line no-console -- the run's trace in CloudWatch (counts only, never a name or an id)
  console.log(describeRetentionJob(result));
  return Response.json(result, { headers: PRIVATE_HEADERS });
};

export const ALL: APIRoute = ({ locals }) => hidden(locals);
