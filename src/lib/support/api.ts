import { z } from "astro/zod";

// Request body of „Wejdź jako wsparcie” (admin-support-log, S-13). Strict: an unknown field is a 400. The cap only
// stops absurd bodies; the real limits and their messages come from parseSupportReason.

export const EnterSupportBody = z.object({ reason: z.string().max(2000) }).strict();
