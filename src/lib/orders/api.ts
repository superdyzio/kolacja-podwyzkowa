import { z } from "astro/zod";

// Request bodies of the organizer order API (restaurant-orders). Strict: any extra key is 400 „Nieprawidłowe dane.”.
// Texts are checked by the rules (rules.ts) afterwards, so their messages (in the request's language) reach the form; the caps here only
// keep absurd bodies out.

const Id = z.number().int().positive();

// Who the line is for: a guest, a table, or nobody (null).
export const OrderAssignment = z.union([z.strictObject({ guestId: Id }), z.strictObject({ tableId: Id }), z.null()]);

export const AddOrderItemBody = z.strictObject({
  name: z.string().max(400),
  note: z.string().max(600).nullable().optional(),
  quantity: z.number(),
  price: z.string().max(40),
  assignment: OrderAssignment.optional(),
});

export const UpdateOrderItemBody = z
  .strictObject({
    name: z.string().max(400).optional(),
    note: z.string().max(600).nullable().optional(),
    quantity: z.number().optional(),
    price: z.string().max(40).optional(),
    assignment: OrderAssignment.optional(),
    delivered: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0);

export type OrderAssignmentInput = z.infer<typeof OrderAssignment>;

// bill-drinks: a drink line of the bill (organizer only): name, price as typed, quantity.
export const AddDrinkBody = z.strictObject({
  name: z.string().max(400),
  quantity: z.number(),
  price: z.string().max(40),
});

export const UpdateDrinkBody = z
  .strictObject({
    name: z.string().max(400).optional(),
    quantity: z.number().optional(),
    price: z.string().max(40).optional(),
  })
  .refine((body) => Object.keys(body).length > 0);
