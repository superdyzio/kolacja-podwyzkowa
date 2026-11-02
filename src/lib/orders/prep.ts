import type { OrderItemDto, OrganizerPrepLineDto, PrepLineDto } from "@/types";
import { compareDishNames, dishKey, lineTotal } from "./rules";

// The prep list (restaurant-orders), pure: one line per dish however it is capitalised (the first-seen spelling is
// shown), the quantity to prepare, what is still to serve and the notes with their quantities; Polish order.

export function organizerPrepList(items: readonly OrderItemDto[]): OrganizerPrepLineDto[] {
  const dishes = new Map<string, OrganizerPrepLineDto & { noteIndex: Map<string, number> }>();
  for (const item of [...items].sort((a, b) => a.id - b.id)) {
    const key = dishKey(item.name);
    let dish = dishes.get(key);
    if (!dish) {
      dish = { name: item.name, quantity: 0, toServe: 0, notes: [], totalGrosze: 0, noteIndex: new Map() };
      dishes.set(key, dish);
    }
    dish.quantity += item.quantity;
    dish.totalGrosze += lineTotal(item);
    if (!item.delivered) {
      dish.toServe += item.quantity;
    }
    if (item.note !== null) {
      const noteKey = dishKey(item.note);
      const index = dish.noteIndex.get(noteKey);
      if (index === undefined) {
        dish.noteIndex.set(noteKey, dish.notes.length);
        dish.notes.push({ note: item.note, quantity: item.quantity });
      } else {
        dish.notes[index].quantity += item.quantity;
      }
    }
  }
  return [...dishes.values()]
    .map(({ noteIndex: _noteIndex, ...dish }) => dish)
    .sort((a, b) => compareDishNames(a.name, b.name));
}

// The restaurant's prep list: the same without money.
export function prepList(items: readonly OrderItemDto[]): PrepLineDto[] {
  return organizerPrepList(items).map(({ totalGrosze: _totalGrosze, ...line }) => line);
}
