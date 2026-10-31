// Deploys the app to AWS Lambda behind a Function URL with the `aws` CLI. Idempotent and update-in-place: it creates
// what is missing (IAM role, function, Function URL, its public permissions, log group) and otherwise updates the
// code and the whole configuration. It NEVER deletes anything — a new function or URL would change the address and
// kill every printed QR card.
//
// Usage:  AWS_REGION=eu-central-1 npm run deploy:aws            (AWS_PROFILE overrides the default profile "mikusia")
//         AWS_REGION=eu-central-1 npm run deploy:aws -- --dry-run   (prints the planned aws commands, calls nothing)
//
// Config and secrets come from .env.aws (gitignored): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AI_PROVIDER (default
// mock), ANTHROPIC_API_KEY, AI_MODEL. They reach AWS only through a temp JSON file (mode 0600, deleted afterwards);
// values are never printed. Pure parts (validation, commands, redaction) live in scripts/lib/aws-deploy.mjs.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PROFILE,
  ENV_FILE,
  FUNCTION_NAME,
  LOG_RETENTION_DAYS,
  RUNTIME,
  SECRET_KEYS,
  ZIP_PATH,
  awsCommands,
  dryRunPlan,
  formatCommand,
  functionEnvironment,
  isValidRegion,
  layerArn,
  missingUrlPermissions,
  parseEnvFile,
  redact,
  validateDeployEnv,
} from "./lib/aws-deploy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

function fail(message) {
  console.error(`\nBŁĄD: ${message}`);
  process.exit(1);
}

// --- Arguments, region, profile, .env.aws ------------------------------------------------------------------------
const flags = process.argv.slice(2);
const dryRun = flags.includes("--dry-run");
const unknownFlags = flags.filter((flag) => flag !== "--dry-run");
if (unknownFlags.length > 0) fail(`nieznane argumenty: ${unknownFlags.join(" ")} (jedyny: --dry-run)`);

const region = process.env.AWS_REGION;
if (!isValidRegion(region)) {
  fail(
    "ustaw AWS_REGION — ten sam region co projekt Supabase, np. AWS_REGION=eu-central-1 npm run deploy:aws " +
      "(bez domyślnej wartości: inny region niż baza to wolne zapytania).",
  );
}
const target = { profile: process.env.AWS_PROFILE || DEFAULT_PROFILE, region };

if (!existsSync(ENV_FILE)) {
  fail(`brak ${ENV_FILE} — utwórz go (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AI_PROVIDER…), patrz README.`);
}
const parsed = parseEnvFile(readFileSync(ENV_FILE, "utf8"));
if (parsed.errors.length > 0) fail(`${ENV_FILE}:\n- ${parsed.errors.join("\n- ")}`);
const validated = validateDeployEnv(parsed.values);
if (!validated.ok) fail(`${ENV_FILE}:\n- ${validated.errors.join("\n- ")}`);
const environment = functionEnvironment(validated.variables);
const secrets = SECRET_KEYS.map((key) => environment[key]).filter(Boolean);

if (dryRun) {
  console.log(`Plan wdrożenia (--dry-run, nic nie jest wywoływane):\n\n${dryRunPlan(target, environment).join("\n")}`);
  process.exit(0);
}

// --- AWS CLI helpers ---------------------------------------------------------------------------------------------
if (spawnSync("aws", ["--version"], { stdio: "ignore" }).error) {
  fail("brak polecenia `aws` (AWS CLI v2). Zainstaluj je i zaloguj się: aws login --profile " + target.profile);
}

// Runs one aws call; prints the (redacted) command, never its output (function configs contain the env values).
function run(args) {
  console.log(`› ${formatCommand(args, secrets)}`);
  const result = spawnSync("aws", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) fail(`nie udało się uruchomić aws: ${result.error.message}`);
  if (result.status === 0) {
    return { ok: true, json: result.stdout.trim() ? JSON.parse(result.stdout) : null, code: null, stderr: "" };
  }
  const stderr = redact(result.stderr.trim(), secrets);
  return { ok: false, json: null, code: /An error occurred \((\w+)\)/.exec(stderr)?.[1] ?? null, stderr };
}

function must(args, hint = "") {
  const result = run(args);
  if (!result.ok) fail(`${result.stderr}${hint ? `\n${hint}` : ""}`);
  return result.json;
}

// The resource, or null when AWS answers with `missingCode` (anything else stops the deploy).
function find(args, missingCode) {
  const result = run(args);
  if (result.ok) return result.json;
  if (result.code === missingCode) return null;
  return fail(result.stderr);
}

// --- Package, then deploy ----------------------------------------------------------------------------------------
console.log(`Wdrożenie ${FUNCTION_NAME}: profil ${target.profile}, region ${region}, ${RUNTIME} arm64.\n`);
execFileSync(process.execPath, [path.join(ROOT, "scripts/package-lambda.mjs")], { stdio: "inherit" });
console.log("");

// The env file holds the secrets: removed on every way out (fail() exits the process, so `finally` is not enough).
const tempDir = mkdtempSync(path.join(tmpdir(), "kolacja-deploy-"));
const envFile = path.join(tempDir, "env.json");
const removeTempDir = () => rmSync(tempDir, { recursive: true, force: true });
process.on("exit", removeTempDir);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => process.exit(130));
writeFileSync(envFile, JSON.stringify({ Variables: environment }), { mode: 0o600 });

try {
  const preCommands = awsCommands(target, { zipPath: ZIP_PATH, envFile, roleArn: "" });
  const identity = must(preCommands.identity);
  console.log(`  konto ${identity.Account}`);
  must(
    preCommands.getLayer,
    `Warstwa ${layerArn(region)} nie jest dostępna w ${region}. Sprawdź region i numer wersji w README AWS Lambda Web Adapter.`,
  );

  // Log group first, so even the first cold start logs with the 7-day retention.
  const logGroup = run(preCommands.createLogGroup);
  if (!logGroup.ok && logGroup.code !== "ResourceAlreadyExistsException") fail(logGroup.stderr);
  must(preCommands.putRetention);
  console.log(`  logi: retencja ${LOG_RETENTION_DAYS} dni`);

  let role = find(preCommands.getRole, "NoSuchEntity");
  if (!role) {
    role = must(preCommands.createRole);
    console.log("  utworzono rolę IAM");
  }
  must(preCommands.attachBasicPolicy);
  const commands = awsCommands(target, { zipPath: ZIP_PATH, envFile, roleArn: role.Role.Arn });

  const existing = find(commands.getFunction, "ResourceNotFoundException");
  if (!existing) {
    // A just-created role takes a few seconds before Lambda may assume it.
    for (let attempt = 1; ; attempt++) {
      const created = run(commands.createFunction);
      if (created.ok) break;
      const roleNotReady = created.code === "InvalidParameterValueException" && /role/i.test(created.stderr);
      if (!roleNotReady || attempt === 12) fail(created.stderr);
      console.log("  rola IAM jeszcze niegotowa — ponawiam za 5 s");
      await sleep(5000);
    }
    must(commands.waitActive);
    console.log("  utworzono funkcję");
  } else {
    must(commands.waitUpdated);
    must(commands.updateCode);
    must(commands.waitUpdated);
    must(commands.updateConfiguration);
    must(commands.waitUpdated);
    console.log("  zaktualizowano kod i konfigurację funkcji");
  }

  let url = find(commands.getUrl, "ResourceNotFoundException");
  if (!url) {
    url = must(commands.createUrl);
    console.log("  utworzono Function URL");
  } else if (url.AuthType !== "NONE") {
    url = must(commands.updateUrlAuth);
    console.log("  Function URL: typ auth zmieniony na NONE (adres bez zmian)");
  }

  const policy = find(commands.getPolicy, "ResourceNotFoundException");
  const missing = missingUrlPermissions(policy?.Policy ?? null);
  const cliHint = "Starsze AWS CLI nie zna tych opcji — zaktualizuj AWS CLI v2.";
  if (missing.url) must(commands.addUrlPermission, cliHint);
  if (missing.invoke) must(commands.addInvokePermission, cliHint);

  const base = String(url.FunctionUrl).replace(/\/$/, "");
  // Permissions and a cold start take a moment; a static file answers without touching the database.
  let status = 0;
  for (let attempt = 0; attempt < 15 && status !== 200; attempt++) {
    if (attempt > 0) await sleep(3000);
    status = await fetch(`${base}/favicon.png`)
      .then((response) => response.status)
      .catch(() => 0);
  }

  console.log(`
Gotowe. Adres aplikacji (Function URL — stały przy kolejnych wdrożeniach):
  ${base}/
Sprawdzenie ${base}/favicon.png: ${status === 200 ? "HTTP 200" : `jeszcze nie odpowiada (HTTP ${status}), spróbuj za chwilę`}.
AI: ${environment.AI_PROVIDER}.

Dalej (README, „Wdrożenie na AWS”):
  1. Pierwsze wdrożenie na AI_PROVIDER=mock i pustej bazie: BASE_URL=${base} npm run smoke
  2. Wyczyść dane smoke w Supabase (SQL Editor): delete from public.event;
  3. AI: w ${ENV_FILE} AI_PROVIDER=anthropic i ANTHROPIC_API_KEY, potem znowu AWS_REGION=${region} npm run deploy:aws
  4. Otwórz ${base}/, „Utwórz wydarzenie”, link organizatora do zakładek.`);
} finally {
  removeTempDir();
}
