import { hashSecretToken } from "./tokens";

// E-mail as the staff login (staff-accounts, F-03). Stored trimmed and lowercase; a light shape check only (the app
// never sends e-mail, so the address is just a name the person remembers). Server only (hashing uses node:crypto).

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const EMAIL_MAX_LENGTH = 254;

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    return null;
  }
  return email;
}

// The throttle key of a login attempt: a hash of what was TYPED (trimmed, lowercase), whether or not an account with
// that e-mail exists, so the throttle answers the same for both and the table holds no readable addresses.
export function loginKeyHash(raw: string): string {
  return hashSecretToken(`login:${raw.trim().toLowerCase()}`);
}
