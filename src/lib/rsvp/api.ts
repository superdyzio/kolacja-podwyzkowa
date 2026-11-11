import { z } from "astro/zod";
import { MAX_RSVP_OPTIONS } from "./rules";

// Request bodies of the guests' RSVP (guest-rsvp-menu, S-25). Strict: any extra key (a guest id, a price) is 400
// „Nieprawidłowe dane.”. Dish names as typed; the rules and the database check them afterwards.

// The client's settings: a deadline typed in Warsaw time ("YYYY-MM-DDTHH:MM"; null = RSVP off), or `close: true`
// (the server's own now), and/or the dishes guests pick from (names on the event's menu). At least one field.
export const RsvpSettingsBody = z
  .strictObject({
    deadline: z.string().max(40).nullable().optional(),
    close: z.literal(true).optional(),
    options: z
      .array(z.string().max(400))
      .max(MAX_RSVP_OPTIONS * 4)
      .optional(),
  })
  .refine((body) => Object.keys(body).length > 0);

// The client's (or the staff's) answer for one guest: attending true / false, or null = „no answer”; a dish only with
// a „yes” (ignored otherwise).
export const RsvpAnswerBody = z.strictObject({
  attending: z.boolean().nullable(),
  dish: z.string().max(400).nullable(),
});

// The guest's own answer on their link (the guest is the key's owner; the body names nobody).
export const GuestRsvpBody = z.strictObject({
  attending: z.boolean(),
  dish: z.string().max(400).nullable(),
});
