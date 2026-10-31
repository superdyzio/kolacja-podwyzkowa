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
export const TIMEOUT_SECONDS = 15;
export const HANDLER = "run.sh";
// AWS Lambda Web Adapter v1.1.0, the arm64 layer from the official README
// (github.com/awslabs/aws-lambda-web-adapter): arn:aws:lambda:${region}:753240598075:layer:LambdaAdapterLayerArm64:30
export const LWA_LAYER_ACCOUNT = "753240598075";
export const LWA_LAYER_NAME = "LambdaAdapterLayerArm64";
export const LWA_LAYER_VERSION = 30;
export const APP_PORT = "8080";
// A static file: the adapter's readiness check must not hit the database (`/` reads the event).
export const READINESS_CHECK_PATH = "/favicon.png";
export const LOG_GROUP = `/aws/lambda/${FUNCTION_NAME}`;
export const LOG_RETENTION_DAYS = 7;
export const DEFAULT_PROFILE = "mikusia";
export const ZIP_PATH = "dist-lambda/function.zip";
export const ENV_FILE = ".env.aws";

export const URL_PERMISSION_SID = "FunctionURLAllowPublicAccess";
export const INVOKE_PERMISSION_SID = "FunctionURLInvokeAllowPublicAccess";

const REQUIRED_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const OPTIONAL_KEYS = ["AI_PROVIDER", "ANTHROPIC_API_KEY", "AI_MODEL"];
export const ALLOWED_KEYS = [...REQUIRED_KEYS, ...OPTIONAL_KEYS];
// Values that are never printed (redact() replaces them in anything shown).
export const SECRET_KEYS = ["SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"];
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
    if (!present[key]) errors.push(`Brak ${key}.`);
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
    "Nic nie jest usuwane (nowa funkcja albo nowy URL zmieniłyby adres i unieważniły wydrukowane karteczki).",
  ];
}
