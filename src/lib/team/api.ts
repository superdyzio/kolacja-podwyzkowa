import { z } from "astro/zod";

// Request bodies of the team API (restaurant-team, S-12). Strict: an unknown field or role is a 400. A known role
// outside the person's scope passes here and is refused by the database with the identical 404. The string caps only
// stop absurd bodies; the real limits and their messages come from parseOwnerInput (e-mail + optional name).

const TEXT = z.string().max(400);
const ROLE = z.enum(["owner", "manager", "waiter"]);

export const InviteMemberBody = z.object({ email: TEXT, name: TEXT.nullable().optional(), role: ROLE }).strict();

export const UpdateMemberBody = z.object({ role: ROLE }).strict();
