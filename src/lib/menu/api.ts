import { z } from "astro/zod";

// Request bodies of the menu catalog (menu-catalog-courses, S-16). Strict: any extra key is 400 „Nieprawidłowe
// dane.”. Texts and prices as typed; the rules (rules.ts) check them afterwards so their messages reach the form.

export const AddMenuItemBody = z.strictObject({
  name: z.string().max(400),
  course: z.string().max(40),
  price: z.string().max(40),
});

export const UpdateMenuItemBody = z
  .strictObject({
    name: z.string().max(400).optional(),
    course: z.string().max(40).optional(),
    price: z.string().max(40).optional(),
  })
  .refine((body) => Object.keys(body).length > 0);

export const SetEventMenuBody = z.strictObject({
  mode: z.enum(["off", "full", "reduced"]),
  itemIds: z.array(z.number().int().positive()).max(1000).optional(),
});
