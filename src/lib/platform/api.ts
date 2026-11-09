import { z } from "astro/zod";

// Request bodies of the platform panel API (platform-restaurants, S-10). Strict: an unknown field is a 400. The
// string caps only stop absurd bodies; the real limits and their messages come from ./rules.

const TEXT = z.string().max(400);

export const CreateRestaurantBody = z
  .object({ name: TEXT, ownerEmail: TEXT, ownerName: TEXT.nullable().optional() })
  .strict();

export const AddOwnerBody = z.object({ email: TEXT, name: TEXT.nullable().optional() }).strict();

export const UpdateRestaurantBody = z.object({ disabled: z.boolean() }).strict();
