// Builds the app and packs it for AWS Lambda: dist-lambda/function.zip, uploaded as is by `npm run deploy:aws`.
// Runtime: Lambda Node.js (arm64) + the AWS Lambda Web Adapter layer (handler `run.sh`,
// AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap); the adapter forwards every Function URL request to the Node server.
//
// Zip layout: run.sh, server/ (the bundled SSR server, entry.mjs) and client/ (static files) side by side — the
// server finds client/ as ../client from its own folder. Production builds bundle every server dependency
// (astro.config.mjs), so the zip carries no node_modules: no dev tooling and no native modules.
//
// Checks before it says OK: no env files and no secret value from .env / .env.aws / .dev.vars in the package, no
// native module for another platform than linux-arm64, zip < 50 MB (direct upload), and the zip itself unpacked in
// a temp dir OUTSIDE the repo (so nothing resolves from the repo's node_modules) loads every server module and
// answers HTTP through run.sh. No AWS calls. Usage: npm run package:lambda

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  closeSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "dist-lambda");
const BUILD = path.join(OUT, "build");
const STAGE = path.join(OUT, "stage");
const ZIP = path.join(OUT, "function.zip");

const MAX_ZIP_BYTES = 50 * 1024 * 1024; // direct zip upload limit
const MAX_UNZIPPED_BYTES = 200 * 1024 * 1024; // Lambda allows 250 MB with layers; keep room for the adapter layer
const SECRET_NAMES = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"];
const SECRET_FILES = [".env", ".env.aws", ".dev.vars"];
const EM_AARCH64 = 0xb7;

const RUN_SH = `#!/bin/bash
# Started by the AWS Lambda Web Adapter (handler "run.sh", AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap), which forwards
# every Function URL request to this Node server. HOST is set here and not in the function env: the adapter itself
# reads a function-level HOST as the address of the app.
export PORT="\${PORT:-8080}"
export HOST="\${HOST:-0.0.0.0}"
exec node "$(dirname "$0")/server/entry.mjs"
`;

function fail(message) {
  console.error(`\nBŁĄD: ${message}`);
  process.exit(1);
}

function listFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

// Values of the secret variables from the local env files (never printed; only file names of matches are).
function secretValues() {
  const values = new Set();
  for (const file of SECRET_FILES) {
    const full = path.join(ROOT, file);
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, "utf8").split("\n")) {
      const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match || !SECRET_NAMES.includes(match[1])) continue;
      const value = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
      if (value.length >= 16) values.add(value);
    }
  }
  return [...values];
}

// ELF header: magic 7F 45 4C 46, e_machine (little endian) at byte 18. Linux arm64 = EM_AARCH64.
function isLinuxArm64Binary(file) {
  const header = Buffer.alloc(20);
  const fd = openSync(file, "r");
  try {
    readSync(fd, header, 0, 20, 0);
  } finally {
    closeSync(fd);
  }
  const isElf = header[0] === 0x7f && header.toString("ascii", 1, 4) === "ELF";
  return isElf && header.readUInt16LE(18) === EM_AARCH64;
}

function checkPackage(dir) {
  const files = listFiles(dir);
  const relative = (file) => path.relative(dir, file);

  const envFiles = files.filter((file) => /^\.env(\..*)?$|^\.dev\.vars$/.test(path.basename(file)));
  if (envFiles.length > 0) fail(`plik ze zmiennymi w paczce: ${envFiles.map(relative).join(", ")}`);

  const secrets = secretValues();
  const leaking = files.filter((file) => {
    const content = readFileSync(file);
    return secrets.some((secret) => content.includes(secret));
  });
  if (leaking.length > 0) fail(`wartość sekretu z pliku env w paczce: ${leaking.map(relative).join(", ")}`);

  const native = files.filter((file) => file.endsWith(".node"));
  const wrongPlatform = native.filter((file) => !isLinuxArm64Binary(file));
  if (wrongPlatform.length > 0) {
    fail(`moduł natywny nie dla linux-arm64: ${wrongPlatform.map(relative).join(", ")}`);
  }

  const totalBytes = files.reduce((sum, file) => sum + statSync(file).size, 0);
  if (totalBytes > MAX_UNZIPPED_BYTES)
    fail(`paczka po rozpakowaniu ma ${totalBytes} B (limit ${MAX_UNZIPPED_BYTES} B)`);
  return { fileCount: files.length, totalBytes, nativeCount: native.length };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

// The unpacked zip, outside the repo: every server module loads (no bare import left unbundled) and run.sh serves
// a static file and an SSR page (without a database: the home page then says the DB is not configured).
async function smokeUnpacked(dir) {
  const runSh = path.join(dir, "run.sh");
  if ((statSync(runSh).mode & 0o111) === 0) fail("run.sh w zipie nie jest wykonywalny");

  const env = { PATH: process.env.PATH, AI_PROVIDER: "mock", ASTRO_NODE_AUTOSTART: "disabled" };
  const loader = `
    import { readdirSync } from "node:fs";
    import path from "node:path";
    import { pathToFileURL } from "node:url";
    const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".mjs") ? [path.join(d, e.name)] : []);
    const modules = walk("server");
    for (const file of modules) await import(pathToFileURL(path.resolve(file)).href);
    console.log(modules.length);
    process.exit(0);`;
  const loaded = spawnSync(process.execPath, ["--input-type=module", "-e", loader], {
    cwd: dir,
    env,
    encoding: "utf8",
  });
  if (loaded.status !== 0) fail(`moduły serwera nie ładują się poza repozytorium:\n${loaded.stderr.slice(0, 2000)}`);

  const port = await freePort();
  const server = spawn("bash", [runSh], {
    cwd: dir,
    env: { PATH: process.env.PATH, AI_PROVIDER: "mock", PORT: String(port), HOST: "127.0.0.1" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  process.on("exit", () => server.kill());
  let stderr = "";
  server.stderr.on("data", (chunk) => (stderr += chunk));
  try {
    const base = `http://127.0.0.1:${port}`;
    let favicon = null;
    for (let attempt = 0; attempt < 50 && !favicon; attempt++) {
      favicon = await fetch(`${base}/favicon.png`).catch(() => null);
      if (!favicon) await sleep(200);
    }
    if (!favicon) fail(`serwer z run.sh nie odpowiada:\n${stderr.slice(0, 2000)}`);
    const home = await fetch(`${base}/`);
    const homeText = await home.text();
    const ok =
      favicon.status === 200 &&
      favicon.headers.get("content-type") === "image/png" &&
      home.status === 200 &&
      homeText.includes("Kolacja podwyżkowa");
    if (!ok) fail(`serwer z run.sh odpowiada źle: favicon ${favicon.status}, strona główna ${home.status}`);
  } finally {
    server.kill();
  }
  return Number(loaded.stdout.trim());
}

// --- 1. Build into dist-lambda/build (never touches dist/, which `npm run preview` serves) -------------------------
if (spawnSync("zip", ["-v"], { stdio: "ignore" }).error || spawnSync("unzip", ["-v"], { stdio: "ignore" }).error) {
  fail("potrzebne są polecenia `zip` i `unzip` (macOS i Linux mają je zwykle w systemie)");
}
rmSync(OUT, { recursive: true, force: true });
console.log("Build (astro build --outDir dist-lambda/build)…");
execFileSync(process.execPath, [path.join(ROOT, "node_modules/astro/bin/astro.mjs"), "build", "--outDir", BUILD], {
  cwd: ROOT,
  stdio: "inherit",
});

// --- 2. Stage: server/, client/, run.sh -------------------------------------------------------------------------
for (const part of ["server", "client"]) {
  if (!existsSync(path.join(BUILD, part))) fail(`brak ${part}/ w wyniku builda`);
  cpSync(path.join(BUILD, part), path.join(STAGE, part), { recursive: true });
}
if (!existsSync(path.join(STAGE, "server/entry.mjs"))) fail("brak server/entry.mjs w wyniku builda");
writeFileSync(path.join(STAGE, "run.sh"), RUN_SH);
chmodSync(path.join(STAGE, "run.sh"), 0o755);
const staged = checkPackage(STAGE);

// --- 3. Zip and check the zip itself ----------------------------------------------------------------------------
execFileSync("zip", ["-q", "-r", "-X", ZIP, "."], { cwd: STAGE, stdio: "inherit" });
const zipBytes = statSync(ZIP).size;
if (zipBytes >= MAX_ZIP_BYTES) fail(`zip ma ${zipBytes} B — limit bezpośredniego wgrania to ${MAX_ZIP_BYTES} B`);

// Unpacked read-only, like /var/task on Lambda (a runtime write next to the server fails here too); removed on every
// way out — fail() exits the process, so a `finally` would not run.
const unpacked = mkdtempSync(path.join(tmpdir(), "kolacja-lambda-"));
process.on("exit", () => {
  spawnSync("chmod", ["-R", "u+w", unpacked]);
  rmSync(unpacked, { recursive: true, force: true });
});
execFileSync("unzip", ["-q", ZIP, "-d", unpacked]);
execFileSync("chmod", ["-R", "a-w", unpacked]);
checkPackage(unpacked);
const moduleCount = await smokeUnpacked(unpacked);
const megabytes = (bytes) => (bytes / 1024 / 1024).toFixed(1);
console.log(`
Gotowe: ${path.relative(ROOT, ZIP)} — ${megabytes(zipBytes)} MB (po rozpakowaniu ${megabytes(staged.totalBytes)} MB, \
${staged.fileCount} plików, moduły natywne: ${staged.nativeCount}).
Sprawdzone: brak plików env i sekretów, ${moduleCount} modułów serwera ładuje się bez node_modules z katalogu tylko do
odczytu, run.sh odpowiada.
Wdrożenie: AWS_REGION=<region> npm run deploy:aws`);
