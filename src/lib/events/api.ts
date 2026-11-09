import { z } from "astro/zod";

// Request bodies of the event routes (restaurant-events, S-11). Strict: an unknown field is a 400. The string caps only
// stop absurd bodies; the real limits and their messages come from ./rules. A PATCH must name at least one field.

const TEXT = z.string().max(400);
const DATE = z.string().max(20);
const GUESTS = z.number().nullable().optional();

export const CreateEventBody = z.object({ name: TEXT, date: DATE, expectedGuests: GUESTS }).strict();

export const UpdateEventBody = z
  .object({ name: TEXT.optional(), date: DATE.optional(), expectedGuests: GUESTS, archived: z.boolean().optional() })
  .strict()
  .refine((body) => Object.keys(body).length > 0);
