import type { z } from "astro/zod";
import { httpMessages } from "@/lib/http";
import type { Locale } from "@/lib/i18n/locale";
import type { AddOrderItemBody, UpdateOrderItemBody } from "./api";
import { isValidQuantity, parseDishName, parseNote, parseUnitPrice, quantityMessage } from "./rules";
import type { OrderItemInput, OrderItemPatch } from "./service";

// From a request body (already shape-checked by zod) to a service input with normalized texts and grosze, or the
// first message for the form (in the request's language) (restaurant-orders). Pure.

export type InputResult<T> = { ok: true; value: T } | { ok: false; message: string };

export function toOrderItemInput(
  body: z.infer<typeof AddOrderItemBody>,
  locale: Locale = "pl",
): InputResult<OrderItemInput> {
  const patch = toOrderItemPatch(body, locale);
  if (!patch.ok) {
    return patch;
  }
  const { name, note, quantity, unitPriceGrosze } = patch.value;
  if (name === undefined || quantity === undefined || unitPriceGrosze === undefined) {
    return { ok: false, message: httpMessages(locale).invalidData };
  }
  return {
    ok: true,
    value: { name, note: note ?? null, quantity, unitPriceGrosze, assignment: body.assignment ?? null },
  };
}

export function toOrderItemPatch(
  body: z.infer<typeof UpdateOrderItemBody>,
  locale: Locale = "pl",
): InputResult<OrderItemPatch> {
  const patch: OrderItemPatch = {};
  if (body.name !== undefined) {
    const name = parseDishName(body.name, locale);
    if (!name.ok) {
      return name;
    }
    patch.name = name.value;
  }
  if (body.note !== undefined) {
    const note = parseNote(body.note, locale);
    if (!note.ok) {
      return note;
    }
    patch.note = note.value;
  }
  if (body.quantity !== undefined) {
    if (!isValidQuantity(body.quantity)) {
      return { ok: false, message: quantityMessage(locale) };
    }
    patch.quantity = body.quantity;
  }
  if (body.price !== undefined) {
    const price = parseUnitPrice(body.price, locale);
    if (!price.ok) {
      return price;
    }
    patch.unitPriceGrosze = price.grosze;
  }
  if (body.assignment !== undefined) {
    patch.assignment = body.assignment;
  }
  if (body.delivered !== undefined) {
    patch.delivered = body.delivered;
  }
  return { ok: true, value: patch };
}
