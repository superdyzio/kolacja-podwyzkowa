import { compareMenuItems } from "@/lib/menu/rules";
import type { OrderItemDto, OrganizerPrepLineDto, PrepLineDto } from "@/types";
import { deliveredCount } from "./pieces";
import { dishKey, lineTotal } from "./rules";

// The prep list (restaurant-orders), pure: one line per dish and course however it is capitalised (the first-seen
// spelling is shown), the quantity to prepare, what is still to serve (pieces not marked delivered, guest-delivered)
// and the notes with their quantities. menu-catalog-courses (S-16): ordered by course (starters, soups, mains,
// desserts, drinks, then free-text lines without a course), Polish order inside a course; a free-text and a menu line
// of the same name are two lines (different course).

export function organizerPrepList(items: readonly OrderItemDto[]): OrganizerPrepLineDto[] {
  const dishes = new Map<string, OrganizerPrepLineDto & { noteIndex: Map<string, number> }>();
  for (const item of [...items].sort((a, b) => a.id - b.id)) {
    const key = `${item.course ?? ""}|${dishKey(item.name)}`;
    let dish = dishes.get(key);
    if (!dish) {
      dish = {
        course: item.course,
        name: item.name,
        quantity: 0,
        toServe: 0,
        notes: [],
        totalGrosze: 0,
        noteIndex: new Map(),
      };
      dishes.set(key, dish);
    }
    dish.quantity += item.quantity;
    dish.totalGrosze += lineTotal(item);
    dish.toServe += item.quantity - deliveredCount(item);
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
  return [...dishes.values()].map(({ noteIndex: _noteIndex, ...dish }) => dish).sort(compareMenuItems);
}

// The restaurant's prep list: the same without money.
export function prepList(items: readonly OrderItemDto[]): PrepLineDto[] {
  return organizerPrepList(items).map(({ totalGrosze: _totalGrosze, ...line }) => line);
}
