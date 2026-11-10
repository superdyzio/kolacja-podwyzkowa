import { z } from "astro/zod";

// Request bodies of the retention routes (privacy-retention, S-26). Pure. The number is checked by
// parseRetentionDays in the route (its message is the form's).

// Owner: PATCH /api/panel/restaurants/<id>/retention.
export const RetentionPatchBody = z.object({ guestRetentionDays: z.number() }).strict();
