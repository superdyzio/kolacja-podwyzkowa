import { z } from "astro/zod";

// Request bodies of the branding routes (event-branding, S-18). Pure. Strings are checked by the rules in the
// routes (their messages are the form's).

// Owner: PATCH /api/panel/restaurants/<id>/branding — at least one field.
export const RestaurantBrandingPatchBody = z
  .object({ name: z.string().max(400).optional(), color: z.string().max(40).nullable().optional() })
  .strict()
  .refine((body) => body.name !== undefined || body.color !== undefined);

// Client (or staff through the dispatcher while the venue leads): PATCH /api/o/<key>/branding.
export const EventBrandingPatchBody = z.object({ name: z.string().max(400).nullable() }).strict();
