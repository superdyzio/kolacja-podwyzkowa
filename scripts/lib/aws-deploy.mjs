// Pure parts of `npm run deploy:aws` (scripts/deploy-aws.mjs): reading .env.aws, validating it, the function's
// environment, the exact `aws` CLI argument lists and redaction. No I/O here, so Vitest covers it with fixtures
// (tests/scripts/aws-deploy.test.ts) and never calls AWS.

import { URL } from "node:url";

export const FUNCTION_NAME = "kolacja-podwyzkowa";
export const ROLE_NAME = "kolacja-podwyzkowa-lambda";
export const BASIC_EXECUTION_POLICY_ARN = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole";
// Newest Node.js LTS runtime Lambda offers (nodejs26.x is still a preview runtime on 2026-10-30).
export const RUNTIME = "nodejs24.x";
export const ARCHITECTURE = "arm64";
export const MEMORY_MB = 1024;
// 30 s: the AI read of the plan photo (venue-drawing) may take up to 25 s; everything else answers in well under a second.
export const TIMEOUT_SECONDS = 30;
export const HANDLER = "run.sh";
// AWS Lambda Web Adapter v1.1.0, the arm64 layer from the official README
// (github.com/awslabs/aws-lambda-web-adapter): arn:aws:lambda:${region}:753240598075:layer:LambdaAdapterLayerArm64:30
export const LWA_LAYER_ACCOUNT = "753240598075";
export const LWA_LAYER_NAME = "LambdaAdapterLayerArm64";
export const LWA_LAYER_VERSION = 30;
export const APP_PORT = "8080";
// A static file: the adapter's readiness check must not depend on the database or render a page.
export const READINESS_CHECK_PATH = "/favicon.png";
export const LOG_GROUP = `/aws/lambda/${FUNCTION_NAME}`;
export const LOG_RETENTION_DAYS = 7;
export const DEFAULT_PROFILE = "mikusia";
export const ZIP_PATH = "dist-lambda/function.zip";
export const ENV_FILE = ".env.aws";

export const URL_PERMISSION_SID = "FunctionURLAllowPublicAccess";
export const INVOKE_PERMISSION_SID = "FunctionURLInvokeAllowPublicAccess";

// The daily guest data clean-up (retention-schedule, the PR #4 review's decision 3): an EventBridge Scheduler schedule
// invokes the function every night with { job, token }; the Lambda Web Adapter forwards a non-HTTP event as a POST
// (JSON body) to AWS_LWA_PASS_THROUGH_PATH — set explicitly here to the app's route (src/pages/api/jobs/retention.ts;
// RETENTION_JOB_PATH and RETENTION_JOB_NAME mirror src/lib/privacy/job.ts, the tests compare them). Scheduler is free
// at this volume. RETENTION_TOKEN is REQUIRED in .env.aws (the restaurant page and the guests' privacy notice promise
// the daily clean-up; the route answers 404 to anything without it), and every deploy proves the path once with a
// dryRun invocation (retentionDryRunInput, classifyRetentionSelfCheck).
export const RETENTION_JOB_PATH = "/api/jobs/retention";
export const RETENTION_JOB_NAME = "guest-data-retention";
export const MIN_RETENTION_TOKEN_LENGTH = 32;
export const SCHEDULE_NAME = `${FUNCTION_NAME}-retention`;
// The schedule group of the schedule (and the scheduler role's aws:SourceArn: AWS's confused-deputy guidance for
// Scheduler scopes it to a schedule GROUP — Scheduler assumes the role with the group's ARN, never the schedule's).
export const SCHEDULE_GROUP = "default";
// 04:15 Polish time, every day: nobody is at a party, and an event's data goes the first night after its last day.
export const SCHEDULE_EXPRESSION = "cron(15 4 * * ? *)";
export const SCHEDULE_TIMEZONE = "Europe/Warsaw";
export const SCHEDULER_ROLE_NAME = `${FUNCTION_NAME}-scheduler`;
export const SCHEDULER_POLICY_NAME = `invoke-${FUNCTION_NAME}`;
export const RETENTION_TOKEN_HINT = "openssl rand -hex 32";

const REQUIRED_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RETENTION_TOKEN"];
const OPTIONAL_KEYS = ["AI_PROVIDER", "ANTHROPIC_API_KEY", "AI_MODEL"];
export const ALLOWED_KEYS = [...REQUIRED_KEYS, ...OPTIONAL_KEYS];
// Values that are never printed (redact() replaces them in anything shown).
export const SECRET_KEYS = ["SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "RETENTION_TOKEN"];
const AI_PROVIDERS = ["mock", "anthropic"];
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1", "host.docker.internal"]);

const TRUST_POLICY = JSON.stringify({
  Version: "2012-10-17",
  Statement: [{ Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" }],
});

/**
 * @param {string} region
 * @returns {string}
 */
export function layerArn(region) {
  return `arn:aws:lambda:${region}:${LWA_LAYER_ACCOUNT}:layer:${LWA_LAYER_NAME}:${LWA_LAYER_VERSION}`;
}

/**
 * Region names like eu-central-1, us-east-2, ap-southeast-1, us-gov-west-1.
 * @param {string | undefined} region
 * @returns {boolean}
 */
export function isValidRegion(region) {
  return typeof region === "string" && /^[a-z]{2}(-gov)?-[a-z]+-\d$/.test(region);
}

/**
 * Dotenv-style lines: KEY=value, optional `export `, quotes, # comments and blank lines.
 * @param {string} text
 * @returns {{ values: Record<string, string>, errors: string[] }}
 */
export function parseEnvFile(text) {
  /** @type {Record<string, string>} */
  const values = {};
  /** @type {string[]} */
  const errors = [];
  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) return;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) {
      errors.push(`Linia ${index + 1}: oczekiwano NAZWA=wartość.`);
      return;
    }
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    const quoted = /^(["'])(.*)\1$/.exec(value);
    if (quoted) {
      value = quoted[2];
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    if (Object.hasOwn(values, key)) {
      errors.push(`Linia ${index + 1}: ${key} występuje drugi raz.`);
      return;
    }
    values[key] = value;
  });
  return { values, errors };
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isLocalUrl(value) {
  const { hostname } = new URL(value);
  return LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost") || /^(10|127|192\.168)\./.test(hostname);
}

/**
 * Checks .env.aws and returns the app's variables for the function (AI_PROVIDER defaults to mock).
 * @param {Record<string, string>} values
 * @returns {{ ok: true, variables: Record<string, string> } | { ok: false, errors: string[] }}
 */
export function validateDeployEnv(values) {
  /** @type {string[]} */
  const errors = [];
  /** @type {Record<string, string>} */
  const present = {};
  for (const [key, value] of Object.entries(values)) {
    if (!ALLOWED_KEYS.includes(key)) {
      errors.push(`Nieznana zmienna ${key} (dozwolone: ${ALLOWED_KEYS.join(", ")}).`);
    } else if (value !== "") {
      present[key] = value;
    }
  }
  for (const key of REQUIRED_KEYS) {
    if (present[key]) continue;
    errors.push(
      key === "RETENTION_TOKEN"
        ? `Brak RETENTION_TOKEN (codzienne usuwanie danych gości po terminie) — wygeneruj: ${RETENTION_TOKEN_HINT}.`
        : `Brak ${key}.`,
    );
  }
  if (present.SUPABASE_URL) {
    if (!URL.canParse(present.SUPABASE_URL)) {
      errors.push("SUPABASE_URL nie jest adresem URL.");
    } else if (isLocalUrl(present.SUPABASE_URL)) {
      errors.push("SUPABASE_URL wskazuje lokalną bazę — na AWS potrzebny jest hostowany projekt Supabase.");
    } else if (new URL(present.SUPABASE_URL).protocol !== "https:") {
      errors.push("SUPABASE_URL musi zaczynać się od https://.");
    }
  }
  const provider = present.AI_PROVIDER ?? "mock";
  if (!AI_PROVIDERS.includes(provider)) {
    errors.push(`AI_PROVIDER musi być jednym z: ${AI_PROVIDERS.join(", ")}.`);
  } else if (provider === "anthropic" && !present.ANTHROPIC_API_KEY) {
    errors.push("AI_PROVIDER=anthropic wymaga ANTHROPIC_API_KEY.");
  }
  if (
    present.RETENTION_TOKEN &&
    (present.RETENTION_TOKEN.length < MIN_RETENTION_TOKEN_LENGTH ||
      !/^[A-Za-z0-9+/=_-]+$/.test(present.RETENTION_TOKEN))
  ) {
    errors.push(
      `RETENTION_TOKEN: co najmniej ${String(MIN_RETENTION_TOKEN_LENGTH)} znaki (litery, cyfry, + / = _ -) — wygeneruj: ${RETENTION_TOKEN_HINT}.`,
    );
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, variables: { ...present, AI_PROVIDER: provider } };
}

/**
 * The function's whole environment: `--environment` REPLACES every variable, so it is always sent complete.
 * @param {Record<string, string>} appVariables
 * @returns {Record<string, string>}
 */
export function functionEnvironment(appVariables) {
  return {
    AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap",
    PORT: APP_PORT,
    AWS_LWA_READINESS_CHECK_PATH: READINESS_CHECK_PATH,
    // Where the adapter POSTs non-HTTP events (the schedule's): the clean-up route, not the adapter's default /events.
    AWS_LWA_PASS_THROUGH_PATH: RETENTION_JOB_PATH,
    ...appVariables,
  };
}

/**
 * Replaces every secret value in a text (commands, AWS error messages) with ***.
 * @param {string} text
 * @param {string[]} secrets
 * @returns {string}
 */
export function redact(text, secrets) {
  return secrets
    .filter((secret) => secret.length >= 4)
    .reduce((result, secret) => result.split(secret).join("***"), text);
}

/**
 * @typedef {{ profile: string, region: string }} AwsTarget
 */

/**
 * Global flags of every call: the profile and region are always explicit, JSON output, no pager.
 * @param {AwsTarget} target
 * @param {string[]} args
 * @returns {string[]}
 */
export function awsArgs(target, args) {
  return [...args, "--profile", target.profile, "--region", target.region, "--output", "json", "--no-cli-pager"];
}

/**
 * Every `aws` call of a deploy, as argument lists (without the leading `aws`).
 * @param {AwsTarget} target
 * @param {{ zipPath: string, envFile: string, roleArn: string }} files
 */
export function awsCommands(target, { zipPath, envFile, roleArn }) {
  const aws = (/** @type {string[]} */ ...args) => awsArgs(target, args);
  const fn = ["--function-name", FUNCTION_NAME];
  const configuration = [
    "--runtime",
    RUNTIME,
    "--handler",
    HANDLER,
    "--memory-size",
    String(MEMORY_MB),
    "--timeout",
    String(TIMEOUT_SECONDS),
    "--layers",
    layerArn(target.region),
    "--environment",
    `file://${envFile}`,
  ];
  return {
    identity: aws("sts", "get-caller-identity"),
    getLayer: aws("lambda", "get-layer-version-by-arn", "--arn", layerArn(target.region)),
    createLogGroup: aws("logs", "create-log-group", "--log-group-name", LOG_GROUP),
    putRetention: aws(
      "logs",
      "put-retention-policy",
      "--log-group-name",
      LOG_GROUP,
      "--retention-in-days",
      String(LOG_RETENTION_DAYS),
    ),
    getRole: aws("iam", "get-role", "--role-name", ROLE_NAME),
    createRole: aws(
      "iam",
      "create-role",
      "--role-name",
      ROLE_NAME,
      "--description",
      "Kolacja podwyzkowa: Lambda execution role (CloudWatch Logs only)",
      "--assume-role-policy-document",
      TRUST_POLICY,
    ),
    attachBasicPolicy: aws(
      "iam",
      "attach-role-policy",
      "--role-name",
      ROLE_NAME,
      "--policy-arn",
      BASIC_EXECUTION_POLICY_ARN,
    ),
    getFunction: aws("lambda", "get-function-configuration", ...fn),
    createFunction: aws(
      "lambda",
      "create-function",
      ...fn,
      "--architectures",
      ARCHITECTURE,
      "--role",
      roleArn,
      "--zip-file",
      `fileb://${zipPath}`,
      ...configuration,
    ),
    waitActive: aws("lambda", "wait", "function-active-v2", ...fn),
    waitUpdated: aws("lambda", "wait", "function-updated-v2", ...fn),
    updateCode: aws(
      "lambda",
      "update-function-code",
      ...fn,
      "--architectures",
      ARCHITECTURE,
      "--zip-file",
      `fileb://${zipPath}`,
    ),
    updateConfiguration: aws("lambda", "update-function-configuration", ...fn, "--role", roleArn, ...configuration),
    getUrl: aws("lambda", "get-function-url-config", ...fn),
    createUrl: aws("lambda", "create-function-url-config", ...fn, "--auth-type", "NONE", "--invoke-mode", "BUFFERED"),
    updateUrlAuth: aws("lambda", "update-function-url-config", ...fn, "--auth-type", "NONE"),
    getPolicy: aws("lambda", "get-policy", ...fn),
    addUrlPermission: aws(
      "lambda",
      "add-permission",
      ...fn,
      "--statement-id",
      URL_PERMISSION_SID,
      "--action",
      "lambda:InvokeFunctionUrl",
      "--principal",
      "*",
      "--function-url-auth-type",
      "NONE",
    ),
    addInvokePermission: aws(
      "lambda",
      "add-permission",
      ...fn,
      "--statement-id",
      INVOKE_PERMISSION_SID,
      "--action",
      "lambda:InvokeFunction",
      "--principal",
      "*",
      "--invoked-via-function-url",
    ),
  };
}

/**
 * The ARN of the schedule's group in this region and account.
 * @param {string} region
 * @param {string} account
 * @returns {string}
 */
export function scheduleGroupArn(region, account) {
  return `arn:aws:scheduler:${region}:${account}:schedule-group/${SCHEDULE_GROUP}`;
}

/**
 * The trust policy of the scheduler's role: only EventBridge Scheduler of this account, for a schedule of the group the
 * deploy's schedule lives in (in this region), may assume it — aws:SourceAccount AND aws:SourceArn (confused deputy).
 * The SourceArn is the schedule GROUP's ARN, as AWS's Scheduler guidance demands ("Do not scope the aws:SourceArn
 * statement to a specific schedule … The ARN you specify must be a schedule group"): a schedule's own ARN there would
 * make every nightly AssumeRole fail.
 * @param {string} account
 * @param {string} region
 * @returns {string}
 */
export function schedulerTrustPolicy(account, region) {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "scheduler.amazonaws.com" },
        Action: "sts:AssumeRole",
        Condition: {
          StringEquals: { "aws:SourceAccount": account, "aws:SourceArn": scheduleGroupArn(region, account) },
        },
      },
    ],
  });
}

/**
 * The scheduler role's only permission: invoking this one function.
 * @param {string} functionArn
 * @returns {string}
 */
export function schedulerInvokePolicy(functionArn) {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [{ Effect: "Allow", Action: "lambda:InvokeFunction", Resource: functionArn }],
  });
}

/**
 * The schedule's input: exactly the body the app's route accepts.
 * @param {string} token
 * @returns {string}
 */
export function retentionScheduleInput(token) {
  return JSON.stringify({ job: RETENTION_JOB_NAME, token });
}

/**
 * The deploy's self-check: the schedule's input plus `dryRun: true` — the app counts what a run would purge and deletes
 * nothing (src/lib/privacy/job.ts). Written to a 0600 temp file, never on the command line (it holds the token).
 * @param {string} token
 * @returns {string}
 */
export function retentionDryRunInput(token) {
  return JSON.stringify({ job: RETENTION_JOB_NAME, token, dryRun: true });
}

/**
 * The schedule's target (written to a 0600 temp file, never on the command line: the input holds the token).
 * @param {{ functionArn: string, roleArn: string, token: string }} options
 */
export function retentionScheduleTarget({ functionArn, roleArn, token }) {
  return { Arn: functionArn, RoleArn: roleArn, Input: retentionScheduleInput(token) };
}

/**
 * The `aws` calls of the daily clean-up: the scheduler's role (trust — also rewritten on an existing role, so a later
 * deploy upgrades it — + inline invoke policy), the schedule (create, or update with every field — update-schedule
 * replaces the whole definition) and the self-check: ONE synchronous invocation of the function with the dryRun input
 * from `checkFile` (exactly the event the schedule sends, plus dryRun), its payload written to `checkOutputFile`.
 * @param {AwsTarget} target
 * @param {{ account: string, functionArn: string, targetFile: string, checkFile?: string, checkOutputFile?: string }} options
 */
export function schedulerCommands(target, { account, functionArn, targetFile, checkFile = "", checkOutputFile = "" }) {
  const aws = (/** @type {string[]} */ ...args) => awsArgs(target, args);
  const role = ["--role-name", SCHEDULER_ROLE_NAME];
  const schedule = [
    "--name",
    SCHEDULE_NAME,
    "--group-name",
    SCHEDULE_GROUP,
    "--schedule-expression",
    SCHEDULE_EXPRESSION,
    "--schedule-expression-timezone",
    SCHEDULE_TIMEZONE,
    "--flexible-time-window",
    JSON.stringify({ Mode: "OFF" }),
    "--state",
    "ENABLED",
    "--description",
    "Kolacja podwyzkowa: daily guest data retention run",
    "--target",
    `file://${targetFile}`,
  ];
  return {
    getSchedulerRole: aws("iam", "get-role", ...role),
    createSchedulerRole: aws(
      "iam",
      "create-role",
      ...role,
      "--description",
      "Kolacja podwyzkowa: EventBridge Scheduler invokes the function for the daily retention run",
      "--assume-role-policy-document",
      schedulerTrustPolicy(account, target.region),
    ),
    updateSchedulerTrust: aws(
      "iam",
      "update-assume-role-policy",
      ...role,
      "--policy-document",
      schedulerTrustPolicy(account, target.region),
    ),
    putSchedulerPolicy: aws(
      "iam",
      "put-role-policy",
      ...role,
      "--policy-name",
      SCHEDULER_POLICY_NAME,
      "--policy-document",
      schedulerInvokePolicy(functionArn),
    ),
    getSchedule: aws("scheduler", "get-schedule", "--name", SCHEDULE_NAME, "--group-name", SCHEDULE_GROUP),
    createSchedule: aws("scheduler", "create-schedule", ...schedule),
    updateSchedule: aws("scheduler", "update-schedule", ...schedule),
    // fileb:// sends the file's bytes as they are (AWS CLI v2 would read a plain file:// payload as base64).
    invokeSelfCheck: aws(
      "lambda",
      "invoke",
      "--function-name",
      FUNCTION_NAME,
      "--payload",
      `fileb://${checkFile}`,
      checkOutputFile,
    ),
  };
}

/**
 * @typedef {{ ok: true, events: number, complete: boolean }
 *   | { ok: false, kind: "invoke-failed" | "function-error" | "no-answer" | "not-json" | "denied" | "unexpected",
 *       detail: string }} RetentionSelfCheck
 */

const SELF_CHECK_DETAIL_LENGTH = 300;

/**
 * @param {unknown} value
 * @returns {value is { dryRun: true, events: number, complete: boolean }}
 */
function isDryRunAnswer(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const answer = /** @type {Record<string, unknown>} */ (value);
  return (
    Object.keys(answer).sort().join(",") === "complete,dryRun,events" &&
    answer.dryRun === true &&
    Number.isInteger(answer.events) &&
    /** @type {number} */ (answer.events) >= 0 &&
    typeof answer.complete === "boolean"
  );
}

/**
 * Reads the self-check's invocation: only the app's dryRun answer `{ dryRun: true, events, complete }` proves the path.
 *
 * How the answer arrives: the Lambda Web Adapter passes a non-HTTP event through lambda_http's `pass_through` — a POST
 * with `Content-Type: application/json` to AWS_LWA_PASS_THROUGH_PATH — and returns the app's response BODY parsed as
 * JSON as the invocation's payload (status and headers dropped; a body that is not JSON text — Astro's text/plain 403
 * of its origin check, an HTML error page, an empty body — becomes `null`). That is the lambda_http source
 * (`LambdaResponse::PassThrough(serde_json::from_str(&body).unwrap_or_default())`), not something checked on AWS, so
 * an HTTP-shaped wrapper `{ statusCode, body }` (body a JSON string or an object) is accepted too, and a raw text body
 * is still recognised.
 * @param {{ invokeError?: string | null, functionError?: string | null, payload: string | null }} invocation
 *   invokeError = the aws CLI's (redacted) stderr when the call itself failed; functionError = `FunctionError` of its
 *   stdout; payload = the output file's text (null when there is none)
 * @returns {RetentionSelfCheck}
 */
export function classifyRetentionSelfCheck({ invokeError = null, functionError = null, payload }) {
  const detail = (/** @type {string} */ text) => text.trim().slice(0, SELF_CHECK_DETAIL_LENGTH);
  if (invokeError !== null) return { ok: false, kind: "invoke-failed", detail: detail(invokeError) };
  if (functionError) {
    return { ok: false, kind: "function-error", detail: detail(`${functionError}: ${payload ?? ""}`) };
  }
  if (payload === null || payload.trim() === "") return { ok: false, kind: "no-answer", detail: "" };
  /** @type {unknown} */
  let value;
  try {
    value = JSON.parse(payload);
  } catch {
    return { ok: false, kind: "not-json", detail: detail(payload) };
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value) && "body" in value) {
    const wrapped = /** @type {{ statusCode?: unknown, body: unknown }} */ (value);
    let body = wrapped.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return { ok: false, kind: "not-json", detail: detail(wrapped.body) };
      }
    }
    if (isDryRunAnswer(body)) {
      return wrapped.statusCode === undefined || wrapped.statusCode === 200
        ? { ok: true, events: body.events, complete: body.complete }
        : { ok: false, kind: "unexpected", detail: detail(payload) };
    }
    value = body;
  }
  if (isDryRunAnswer(value)) return { ok: true, events: value.events, complete: value.complete };
  // null = the adapter's form of any non-JSON body; a JSON string = a text body handed back as it was.
  if (value === null || typeof value === "string") return { ok: false, kind: "not-json", detail: detail(payload) };
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (/** @type {{ error?: unknown }} */ (value).error) === "string"
  ) {
    return { ok: false, kind: "denied", detail: detail(payload) };
  }
  return { ok: false, kind: "unexpected", detail: detail(payload) };
}

/**
 * The loud explanation printed at the very end of a deploy whose self-check failed (then the deploy exits 1): what
 * came back, what it means, what still deletes guest data meanwhile and how to check again.
 * @param {Exclude<RetentionSelfCheck, { ok: true }>} check
 * @param {AwsTarget} target
 * @returns {string[]}
 */
export function retentionSelfCheckFailure(check, target) {
  const flags = `--profile ${target.profile} --region ${target.region}`;
  /** @type {Record<typeof check.kind, string[]>} */
  const meaning = {
    "invoke-failed": [
      "Nie udało się wywołać funkcji (profil bez lambda:InvokeFunction albo sieć) — ścieżki nie sprawdzono.",
    ],
    "function-error": [
      "Funkcja zakończyła się błędem (awaria, przekroczony czas albo Lambda Web Adapter nie doczekał się serwera).",
      `Logi: aws logs tail ${LOG_GROUP} --since 15m ${flags}`,
    ],
    "no-answer": ["Wywołanie nie zapisało żadnej odpowiedzi."],
    "not-json": [
      "Aplikacja nie odpowiedziała JSON-em — Lambda Web Adapter zamienia taką odpowiedź na null. Najpewniej Astro",
      "odrzucił POST bez nagłówka Content-Type: application/json (403 „Cross-site POST form submissions are forbidden”):",
      "założenie o adapterze się nie sprawdziło i potrzebna jest zmiana w kodzie. Inne możliwości: AWS_LWA_PASS_THROUGH_PATH",
      `nie wskazuje ${RETENTION_JOB_PATH} (strona 404) albo serwer odpowiedział stroną błędu 5xx (logi: aws logs tail ${LOG_GROUP} --since 15m ${flags}).`,
    ],
    denied: [
      "Aplikacja odmówiła (404 „Brak dostępu”): funkcja nie ma tego samego RETENTION_TOKEN co wywołanie (sprawdź .env.aws",
      "i wdroż ponownie) albo działa na niej kod bez dryRun.",
    ],
    unexpected: ['Odpowiedź nie jest wynikiem sprawdzenia (oczekiwano {"dryRun":true,"events":…,"complete":…}).'],
  };
  return [
    "",
    "!!! BŁĄD: SAMOSPRAWDZENIE CODZIENNEGO USUWANIA DANYCH GOŚCI NIE PRZESZŁO !!!",
    `Wywołanie funkcji takie jak z harmonogramu ${SCHEDULE_NAME}, z dryRun (nic nie usuwa), zwróciło: ${check.detail || "(nic)"}`,
    ...meaning[check.kind],
    "Dopóki to nie działa, nocny harmonogram NIE usuwa danych gości po terminie, choć strona restauracji i informacja",
    "dla gości to obiecują. Dane po terminie dalej usuwa: otwarcie wydarzenia (każdy jego link i panel), przeglądanie",
    "panelu (sprzątanie co 10 minut, do 25 wydarzeń) i ręcznie: npm run retention -- --remote (README).",
    "Po poprawce wdroż ponownie albo sprawdź ręcznie (README „Codzienne usuwanie danych gości”):",
    ...retentionCheckCommands(target).map((line) => `  ${line}`),
  ];
}

/**
 * Which public Function URL statements the resource policy lacks (since October 2025 a public URL needs both
 * lambda:InvokeFunctionUrl with FunctionUrlAuthType NONE and lambda:InvokeFunction via the function URL).
 * @param {string | null} policyJson the `Policy` string of `get-policy`, null when the function has no policy
 * @returns {{ url: boolean, invoke: boolean }} true = must be added
 */
export function missingUrlPermissions(policyJson) {
  /** @type {Array<Record<string, unknown>>} */
  let statements = [];
  if (policyJson) {
    const parsed = /** @type {{ Statement?: unknown }} */ (JSON.parse(policyJson));
    statements = Array.isArray(parsed.Statement) ? parsed.Statement : [];
  }
  const isPublic = (/** @type {Record<string, unknown>} */ statement) =>
    statement.Effect === "Allow" &&
    (statement.Principal === "*" || JSON.stringify(statement.Principal) === JSON.stringify({ AWS: "*" }));
  const conditionValue = (/** @type {Record<string, unknown>} */ statement, operator, key) => {
    const condition = /** @type {Record<string, Record<string, unknown>> | undefined} */ (statement.Condition);
    return String(condition?.[operator]?.[key] ?? "").toLowerCase();
  };
  const hasUrl = statements.some(
    (statement) =>
      isPublic(statement) &&
      statement.Action === "lambda:InvokeFunctionUrl" &&
      conditionValue(statement, "StringEquals", "lambda:FunctionUrlAuthType") === "none",
  );
  const hasInvoke = statements.some(
    (statement) =>
      isPublic(statement) &&
      statement.Action === "lambda:InvokeFunction" &&
      conditionValue(statement, "Bool", "lambda:InvokedViaFunctionUrl") === "true",
  );
  return { url: !hasUrl, invoke: !hasInvoke };
}

/**
 * A command line for the console, secrets replaced with ***; arguments with spaces or JSON are single-quoted.
 * @param {string[]} args
 * @param {string[]} secrets
 * @returns {string}
 */
export function formatCommand(args, secrets) {
  const shown = args.map((arg) => (/^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`));
  return redact(["aws", ...shown].join(" "), secrets);
}

/**
 * The dry-run plan: every step with its condition, in order, nothing secret (the env file is named, never shown).
 * @param {AwsTarget} target
 * @param {Record<string, string>} environment the complete function environment
 * @returns {string[]}
 */
export function dryRunPlan(target, environment) {
  const secrets = SECRET_KEYS.map((key) => environment[key]).filter((value) => typeof value === "string");
  const commands = awsCommands(target, {
    zipPath: ZIP_PATH,
    envFile: "<plik tymczasowy 0600 z env funkcji>",
    roleArn: `arn:aws:iam::<konto>:role/${ROLE_NAME}`,
  });
  const show = (/** @type {string[]} */ args) => `    ${formatCommand(args, secrets)}`;
  return [
    `Profil ${target.profile}, region ${target.region}. Najpierw npm run package:lambda (${ZIP_PATH}).`,
    `Zmienne funkcji (wartości ukryte): ${Object.keys(environment).join(", ")}.`,
    "1. Tożsamość i warstwa Lambda Web Adapter w regionie:",
    show(commands.identity),
    show(commands.getLayer),
    "2. Grupa logów (gdy już jest — bez zmian), retencja 7 dni:",
    show(commands.createLogGroup),
    show(commands.putRetention),
    "3. Rola IAM — gdy brak, utworzenie; polityka AWSLambdaBasicExecutionRole zawsze dołączona:",
    show(commands.getRole),
    show(commands.createRole),
    show(commands.attachBasicPolicy),
    "4a. Funkcja — gdy brak: utworzenie (ponawiane, dopóki nowa rola nie jest gotowa), potem czekanie:",
    show(commands.getFunction),
    show(commands.createFunction),
    show(commands.waitActive),
    "4b. Funkcja — gdy jest: nowy kod, czekanie, pełna konfiguracja (całe env), czekanie:",
    show(commands.waitUpdated),
    show(commands.updateCode),
    show(commands.waitUpdated),
    show(commands.updateConfiguration),
    show(commands.waitUpdated),
    "5. Function URL (auth NONE) — gdy brak, utworzenie; gdy ma inny typ auth, zmiana na NONE (adres się nie zmienia):",
    show(commands.getUrl),
    show(commands.createUrl),
    show(commands.updateUrlAuth),
    "6. Publiczny dostęp do URL — brakujące wpisy polityki:",
    show(commands.getPolicy),
    show(commands.addUrlPermission),
    show(commands.addInvokePermission),
    ...retentionPlan(target, show),
    "Nic nie jest usuwane (nowa funkcja albo nowy URL zmieniłyby adres i unieważniły wydrukowane karteczki).",
  ];
}

/**
 * Steps 7 and 8 of the dry-run plan: the daily clean-up's role and schedule, then the self-check (RETENTION_TOKEN is
 * required, so they always run).
 * @param {AwsTarget} target
 * @param {(args: string[]) => string} show
 * @returns {string[]}
 */
function retentionPlan(target, show) {
  const commands = schedulerCommands(target, {
    account: "<konto>",
    functionArn: `arn:aws:lambda:${target.region}:<konto>:function:${FUNCTION_NAME}`,
    targetFile: "<plik tymczasowy 0600 z celem harmonogramu i tokenem>",
    checkFile: "<plik tymczasowy 0600 z wejściem harmonogramu i dryRun>",
    checkOutputFile: "<plik tymczasowy z odpowiedzią>",
  });
  return [
    `7. Codzienne usuwanie danych gości po terminie (${SCHEDULE_EXPRESSION}, ${SCHEDULE_TIMEZONE}, AWS_LWA_PASS_THROUGH_PATH=${RETENTION_JOB_PATH}):`,
    `   rola ${SCHEDULER_ROLE_NAME} — gdy brak, utworzenie, inaczej aktualizacja zaufania (aws:SourceAccount i aws:SourceArn`,
    `   grupy harmonogramów ${SCHEDULE_GROUP}); zawsze polityka wywołania tej funkcji:`,
    show(commands.getSchedulerRole),
    show(commands.createSchedulerRole),
    show(commands.updateSchedulerTrust),
    show(commands.putSchedulerPolicy),
    `   harmonogram ${SCHEDULE_NAME} — gdy brak, utworzenie, inaczej pełna aktualizacja (ponawiane, dopóki nowa rola nie jest gotowa):`,
    show(commands.getSchedule),
    show(commands.createSchedule),
    show(commands.updateSchedule),
    "8. Samosprawdzenie: czekanie na funkcję, potem JEDNO wywołanie z wejściem harmonogramu i dryRun (nic nie usuwa);",
    '   tylko odpowiedź {"dryRun":true,"events":…,"complete":…} jest poprawna — inaczej wyjaśnienie i kod wyjścia 1 na końcu:',
    show(awsCommands(target, { zipPath: ZIP_PATH, envFile: "", roleArn: "" }).waitUpdated),
    show(commands.invokeSelfCheck),
  ];
}

/**
 * The manual check of the daily clean-up (README „Wdrożenie na AWS” → „Codzienne usuwanie danych gości”), the deploy's
 * self-check by hand: the schedule's own input goes to a fresh temp directory only this user reads (the token never
 * reaches the command line, the shell history or the repository), `dryRun: true` is appended (the input is one line of
 * JSON and the token has no `}`), one synchronous invocation (nothing deleted), the answer and the log line.
 * @param {AwsTarget} target
 * @returns {string[]}
 */
export function retentionCheckCommands(target) {
  const flags = `--profile ${target.profile} --region ${target.region}`;
  return [
    'd="$(mktemp -d)"',
    `aws scheduler get-schedule --name ${SCHEDULE_NAME} --group-name ${SCHEDULE_GROUP} --query Target.Input --output text ${flags} > "$d/input.json"`,
    `sed 's/}$/,"dryRun":true}/' "$d/input.json" > "$d/check.json"`,
    `aws lambda invoke --function-name ${FUNCTION_NAME} --payload "fileb://$d/check.json" ${flags} "$d/output.json"`,
    'cat "$d/output.json"; echo; rm -r "$d"',
    `aws logs tail ${LOG_GROUP} --since 15m --filter-pattern Retencja ${flags}`,
  ];
}

/**
 * What to do after a deploy, printed at the end of `npm run deploy:aws` (README „Wdrożenie na AWS” → „Pierwsze
 * uruchomienie”). The hosted database holds every restaurant of the platform: never print a SQL statement for it, never
 * the smoke (it refuses anything but a local database) and never a way to start an event that no longer exists.
 * `selfCheck`: the clean-up's self-check of this deploy (classifyRetentionSelfCheck); null = not run (the manual check
 * is printed instead). A failed one is explained right after these steps (retentionSelfCheckFailure).
 * @param {{ base: string, region: string, aiProvider: string, profile?: string,
 *   selfCheck?: RetentionSelfCheck | null }} options base = the Function URL without a trailing slash
 * @returns {string}
 */
export function nextSteps({ base, region, aiProvider, profile = DEFAULT_PROFILE, selfCheck = null }) {
  const lines = [
    "Dalej (README, „Wdrożenie na AWS” → „Pierwsze uruchomienie”):",
    `  1. Pierwszy administrator platformy (raz; zmienne z ${ENV_FILE}, skrypt najpierw wypisuje host bazy):`,
    `     BASE_URL=${base} SUPABASE_URL=<z ${ENV_FILE}> SUPABASE_SERVICE_ROLE_KEY=<z ${ENV_FILE}> npm run platform:admin -- <twój e-mail> --remote`,
    `     Otwórz wypisany link ${base}/haslo/…, ustaw hasło i zaloguj się na ${base}/logowanie.`,
    `  2. Smoke działa tylko na lokalnej bazie — tu sprawdź ręcznie w ${base}/panel (README „Pierwsze uruchomienie”);`,
    "     wydarzenie testowe usuwasz w panelu („Usuń trwale” na jego karcie), nigdy poleceniem SQL.",
    `  3. Restauracje z właścicielami zakładasz w ${base}/panel/platforma („Nowa restauracja”), wydarzenia właściciel w swoim panelu.`,
  ];
  const schedule = `harmonogram ${SCHEDULE_NAME} (${SCHEDULE_EXPRESSION}, ${SCHEDULE_TIMEZONE})`;
  if (selfCheck === null) {
    lines.push(
      `  4. Codzienne usuwanie danych gości po terminie: ${schedule}.`,
      "     Sprawdź raz ręcznie (wynik: liczby w JSON, w logach linia „Retencja danych gości”; README „Codzienne usuwanie”):",
      ...retentionCheckCommands({ profile, region }).map((line) => `       ${line}`),
    );
  } else if (selfCheck.ok) {
    lines.push(
      `  4. Codzienne usuwanie danych gości po terminie: ${schedule} — samosprawdzenie przeszło`,
      `     (wywołanie jak z harmonogramu, z dryRun: po terminie ${String(selfCheck.events)}${selfCheck.complete ? "" : " lub więcej"} wydarzeń, nic nie usunięto).`,
      "     Po pierwszej nocy w logach powinna być linia „Retencja danych gości (codzienne sprzątanie)”:",
      `       aws logs tail ${LOG_GROUP} --since 24h --filter-pattern Retencja --profile ${profile} --region ${region}`,
    );
  } else {
    lines.push(
      `  4. UWAGA: samosprawdzenie codziennego usuwania danych gości NIE przeszło (${schedule}) — szczegóły niżej.`,
    );
  }
  if (aiProvider !== "anthropic") {
    lines.push(
      `  5. AI: w ${ENV_FILE} AI_PROVIDER=anthropic i ANTHROPIC_API_KEY, potem znowu AWS_REGION=${region} npm run deploy:aws`,
    );
  }
  return lines.join("\n");
}
