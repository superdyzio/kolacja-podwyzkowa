import type { z } from "astro/zod";
import { httpMessages } from "@/lib/http";
import type { Locale } from "@/lib/i18n/locale";
import type { AddDrinkBody, AddOrderItemBody, UpdateDrinkBody, UpdateOrderItemBody } from "./api";
import { drinkQuantityMessage, isValidDrinkQuantity, parseDrinkName } from "./drinks";
import type { DrinkInput, DrinkPatch } from "./drinks-service";
import { isValidQuantity, parseDishName, parseNote, quantityMessage } from "./rules";
import type { OrderItemInput, OrderItemPatch } from "./service";

// From a request body (already shape-checked by zod) to a service input with normalized texts, or the first message
// for the form (in the request's language) (restaurant-orders). Pure. Since client-restaurant-split no body carries a
// price: the routes add the price of the line's name (prices-service.ts).

export type InputResult<T> = { ok: true; value: T } | { ok: false; message: string };

export type UnpricedOrderItemInput = Omit<OrderItemInput, "unitPriceGrosze">;
export type UnpricedOrderItemPatch = Omit<OrderItemPatch, "unitPriceGrosze">;
export type UnpricedDrinkInput = Omit<DrinkInput, "unitPriceGrosze">;
export type UnpricedDrinkPatch = Omit<DrinkPatch, "unitPriceGrosze">;

export function toOrderItemInput(
  body: z.infer<typeof AddOrderItemBody>,
  locale: Locale = "pl",
): InputResult<UnpricedOrderItemInput> {
  const patch = toOrderItemPatch(body, locale);
  if (!patch.ok) {
    return patch;
  }
  const { name, note, quantity } = patch.value;
  if (name === undefined || quantity === undefined) {
    return { ok: false, message: httpMessages(locale).invalidData };
  }
  return {
    ok: true,
    value: { name, note: note ?? null, quantity, assignment: body.assignment ?? null },
  };
}

export function toOrderItemPatch(
  body: z.infer<typeof UpdateOrderItemBody>,
  locale: Locale = "pl",
): InputResult<UnpricedOrderItemPatch> {
  const patch: UnpricedOrderItemPatch = {};
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
  if (body.assignment !== undefined) {
    patch.assignment = body.assignment;
  }
  if (body.delivered !== undefined) {
    patch.delivered = body.delivered;
  }
  return { ok: true, value: patch };
}

// bill-drinks: a drink line from its body, every field checked like the form does.
export function toDrinkInput(
  body: z.infer<typeof AddDrinkBody>,
  locale: Locale = "pl",
): InputResult<UnpricedDrinkInput> {
  const patch = toDrinkPatch(body, locale);
  if (!patch.ok) {
    return patch;
  }
  const { name, quantity } = patch.value;
  if (name === undefined || quantity === undefined) {
    return { ok: false, message: httpMessages(locale).invalidData };
  }
  return { ok: true, value: { name, quantity } };
}

export function toDrinkPatch(
  body: z.infer<typeof UpdateDrinkBody>,
  locale: Locale = "pl",
): InputResult<UnpricedDrinkPatch> {
  const patch: UnpricedDrinkPatch = {};
  if (body.name !== undefined) {
    const name = parseDrinkName(body.name, locale);
    if (!name.ok) {
      return name;
    }
    patch.name = name.value;
  }
  if (body.quantity !== undefined) {
    if (!isValidDrinkQuantity(body.quantity)) {
      return { ok: false, message: drinkQuantityMessage(locale) };
    }
    patch.quantity = body.quantity;
  }
  return { ok: true, value: patch };
}
