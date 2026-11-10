import { z } from "astro/zod";
import { MODULE_KEYS } from "./rules";

// Request bodies of the module routes (event-modules, S-17). Pure.

export const ModuleKeySchema = z.enum(MODULE_KEYS);

// Client: PUT /api/o/<key>/modules
export const SetModuleEnabledBody = z.object({ module: ModuleKeySchema, enabled: z.boolean() }).strict();

// Venue: PUT /api/panel/events/<id>/modules
export const SetModuleAvailableBody = z.object({ module: ModuleKeySchema, available: z.boolean() }).strict();

// Platform administrator: PUT /api/panel/platform/events/<id>/modules/<module>
export const SetModuleUnlockedBody = z.object({ unlocked: z.boolean() }).strict();
