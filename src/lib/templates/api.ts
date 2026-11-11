import { z } from "astro/zod";

// Request bodies of the template routes (venue-templates, S-15). Strict: an unknown field is a 400. The string cap
// only stops absurd bodies; the name rule and its message come from ./rules and ./messages.

const TEXT = z.string().max(400);
const ID = z.number().int().positive();

// POST /api/panel/restaurants/<id>/templates: an empty template, or a copy of an event's room (`sourceEventId`).
export const CreateTemplateBody = z.object({ name: TEXT, sourceEventId: ID.optional() }).strict();

// PATCH /api/panel/templates/<id>.
export const UpdateTemplateBody = z.object({ name: TEXT }).strict();
