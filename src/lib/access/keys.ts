// Access keys identify a role (organizer, TV, guest) through the URL path. They must be unguessable (NFR-009),
// so they come from a CSPRNG and carry ACCESS_KEY_BYTES * 8 = 144 bits of entropy.
// Web Crypto + btoa work the same on the server (Node) and in browsers (no Buffer).

export const ACCESS_KEY_BYTES = 18;
export const ACCESS_KEY_LENGTH = 24; // 18 bytes in base64url, no padding

const ACCESS_KEY_PATTERN = /^[A-Za-z0-9_-]{24}$/;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function generateAccessKey(): string {
  const bytes = new Uint8Array(ACCESS_KEY_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export function isWellFormedAccessKey(value: unknown): value is string {
  return typeof value === "string" && ACCESS_KEY_PATTERN.test(value);
}
