import { hashSecretToken } from "./tokens";

// E-mail as the staff login (staff-accounts, F-03). The shape rule lives in the pure ./email-format (islands use it);
// this module adds the throttle key and is server only (hashing uses node:crypto).

export { EMAIL_MAX_LENGTH, normalizeEmail } from "./email-format";

// The throttle key of a login attempt: a hash of what was TYPED (trimmed, lowercase), whether or not an account with
// that e-mail exists, so the throttle answers the same for both and the table holds no readable addresses.
export function loginKeyHash(raw: string): string {
  return hashSecretToken(`login:${raw.trim().toLowerCase()}`);
}
