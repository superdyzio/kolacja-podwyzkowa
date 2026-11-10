import { z } from "astro/zod";

// Request bodies of the per-event waiter API (event-waiter-access, S-21b). Strict: an unknown field is a 400. The cap
// only stops absurd bodies; the name's real rule and message come from parseWaiterName.

export const AddEventWaiterBody = z.object({ name: z.string().max(400) }).strict();
