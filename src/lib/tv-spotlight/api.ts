import { z } from "astro/zod";
import { TV_SHOWABLE_KINDS } from "./rules";

// Request body of PUT /api/o/<key>/tv-spotlight: a question or an AI topic the organizer sends to the TV. The text is
// normalized and length-checked by the service (normalizeSpotlightText).
export const ShowOnTvBody = z.strictObject({
  kind: z.enum(TV_SHOWABLE_KINDS),
  text: z.string().max(2000),
});
