import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./limits";

// Staff passwords (staff-accounts, F-03): scrypt from node:crypto, no dependency. The stored string carries its own
// parameters — `scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>` — so the cost can be raised later without breaking
// existing accounts. Verification always runs scrypt (against a fixed dummy hash when there is no usable one), so a
// missing account or a missing password costs the same time as a wrong password. Server only (node:crypto).

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

export const DEFAULT_SCRYPT_PARAMS: ScryptParams = { N: 32768, r: 8, p: 1 };

const SALT_BYTES = 16;
const KEY_BYTES = 64;
// 128 * N * r = 32 MiB for the defaults, which equals Node's default maxmem (it would throw): allow 64 MiB.
const MAX_MEMORY = 64 * 1024 * 1024;

export type NewPasswordCheck = "ok" | "too-short" | "too-long" | "mismatch";

// Length in code points (as every other text rule of the app), then the repeat.
export function checkNewPassword(password: string, repeat: string): NewPasswordCheck {
  const length = Array.from(password).length;
  if (length < PASSWORD_MIN_LENGTH) {
    return "too-short";
  }
  if (length > PASSWORD_MAX_LENGTH) {
    return "too-long";
  }
  return password === repeat ? "ok" : "mismatch";
}

function deriveKey(password: string, salt: Buffer, params: ScryptParams, length: number): Promise<Buffer> {
  const options: ScryptOptions = { N: params.N, r: params.r, p: params.p, maxmem: MAX_MEMORY };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFC"), salt, length, options, (error, key) => {
      if (error) {
        reject(error);
      } else {
        resolve(key);
      }
    });
  });
}

export async function hashPassword(password: string, params: ScryptParams = DEFAULT_SCRYPT_PARAMS): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt, params, KEY_BYTES);
  return ["scrypt", params.N, params.r, params.p, salt.toString("base64"), key.toString("base64")].join("$");
}

interface ParsedHash {
  params: ScryptParams;
  salt: Buffer;
  key: Buffer;
}

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 1 && (value & (value - 1)) === 0;
}

export function parsePasswordHash(stored: string): ParsedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return null;
  }
  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (!isPowerOfTwo(N) || N > 1_048_576 || !Number.isInteger(r) || r < 1 || r > 32 || !Number.isInteger(p)) {
    return null;
  }
  if (p < 1 || p > 16 || 128 * N * r > MAX_MEMORY) {
    return null;
  }
  const salt = Buffer.from(parts[4], "base64");
  const key = Buffer.from(parts[5], "base64");
  if (salt.length < 8 || key.length < 32) {
    return null;
  }
  return { params: { N, r, p }, salt, key };
}

// A valid hash of a random password nobody knows, verified when there is no usable stored hash (equal timing).
const DUMMY: ParsedHash = {
  params: DEFAULT_SCRYPT_PARAMS,
  salt: Buffer.from("a2FsYWN6eWEtcG9kd3l6a293YQ==", "base64"),
  key: Buffer.alloc(KEY_BYTES, 7),
};

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parsed = stored === null ? null : parsePasswordHash(stored);
  const target = parsed ?? DUMMY;
  const key = await deriveKey(password, target.salt, target.params, target.key.length);
  const equal = key.length === target.key.length && timingSafeEqual(key, target.key);
  return parsed !== null && equal;
}
