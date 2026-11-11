// The e-mail shape rule of staff logins (staff-accounts, F-03), pure — no node:crypto — so React islands can check a
// typed address before sending it (platform-restaurants). Stored trimmed and lowercase; a light shape check only (the
// app never sends e-mail, so the address is just a name the person remembers).

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const EMAIL_MAX_LENGTH = 254;

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    return null;
  }
  return email;
}
