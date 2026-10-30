// Writes SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the LOCAL Supabase (Docker) into .env, keeping every other
// line of it (e.g. AI_PROVIDER, ANTHROPIC_API_KEY). .env is the only env file: `npm run dev` reads it through Vite,
// `npm run preview` and the scripts through `node --env-file-if-exists=.env`. Usage: npm run env:local
//
// `supabase status -o env` prints no API keys when the auth service (gotrue) is not running, which is how this
// project runs Supabase locally. So: take SERVICE_ROLE_KEY from the status output when present, otherwise sign a
// `service_role` JWT with the local JWT secret (Supabase's default local secret, or SUPABASE_JWT_SECRET).
// Whatever key is chosen is verified against the local REST API before anything is written.
// Never use this for a hosted Supabase project: there the key comes from the dashboard.

import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const DEFAULT_API_URL = "http://127.0.0.1:54321";
const DEFAULT_LOCAL_JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
const ENV_FILE = ".env";

function readSupabaseStatus() {
  try {
    const output = execFileSync("npx", ["supabase", "status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const vars = {};
    for (const line of output.split("\n")) {
      const match = /^([A-Z_]+)="?([^"]*)"?$/.exec(line.trim());
      if (match) vars[match[1]] = match[2];
    }
    return vars;
  } catch {
    return {};
  }
}

function signServiceRoleJwt(secret) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ iss: "supabase-demo", role: "service_role", exp: 1983812996 });
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

async function keyWorks(apiUrl, key) {
  try {
    const response = await fetch(`${apiUrl}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    return response.ok;
  } catch {
    return false;
  }
}

function upsertEnvFile(path, values) {
  const names = new Set(Object.keys(values));
  const kept = existsSync(path)
    ? readFileSync(path, "utf8")
        .split("\n")
        .filter((line) => !names.has(line.split("=")[0].trim()))
    : [];
  while (kept.length > 0 && kept[kept.length - 1].trim() === "") kept.pop();
  const lines = [...kept, ...Object.entries(values).map(([name, value]) => `${name}=${value}`)];
  writeFileSync(path, `${lines.join("\n")}\n`, { mode: 0o600 });
}

const status = readSupabaseStatus();
const apiUrl = status.API_URL || DEFAULT_API_URL;
const candidates = [
  status.SERVICE_ROLE_KEY,
  signServiceRoleJwt(process.env.SUPABASE_JWT_SECRET || DEFAULT_LOCAL_JWT_SECRET),
].filter(Boolean);

let serviceRoleKey = null;
for (const candidate of candidates) {
  if (await keyWorks(apiUrl, candidate)) {
    serviceRoleKey = candidate;
    break;
  }
}

if (!serviceRoleKey) {
  console.error(
    `Nie udało się zweryfikować klucza service role pod ${apiUrl}. Czy lokalny Supabase działa (npx supabase status)?`,
  );
  process.exit(1);
}

upsertEnvFile(ENV_FILE, { SUPABASE_URL: apiUrl, SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey });
console.log(`Zapisano SUPABASE_URL=${apiUrl} i SUPABASE_SERVICE_ROLE_KEY do ${ENV_FILE}.`);
