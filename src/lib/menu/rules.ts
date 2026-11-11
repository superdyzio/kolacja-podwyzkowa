import type { Locale } from "@/lib/i18n/locale";
import { compareDishNames, dishKey, parseDishName, parseUnitPrice } from "@/lib/orders/rules";
import type { EventMenuMode, MenuCourse, MenuItemDto, OrderMenuDto, OrderMenuItemDto } from "@/types";
import { menuMessages } from "./messages";

// The menu catalog's rules (menu-catalog-courses, S-16; FR-037), pure: the courses in the kitchen's order, the input
// rules of a catalog item (name like a dish name, price like a unit price), the grouping by course and the lookup of
// a dish on an event's available menu.

export const MENU_COURSES = ["starter", "soup", "main", "dessert", "drinks"] as const satisfies readonly MenuCourse[];
export const EVENT_MENU_MODES = ["off", "full", "reduced"] as const satisfies readonly EventMenuMode[];
export const MAX_MENU_ITEMS = 300;

export function isMenuCourse(value: unknown): value is MenuCourse {
  return typeof value === "string" && (MENU_COURSES as readonly string[]).includes(value);
}

export function isEventMenuMode(value: unknown): value is EventMenuMode {
  return typeof value === "string" && (EVENT_MENU_MODES as readonly string[]).includes(value);
}

// The course's position; null (free text) after every course.
export function courseRank(course: MenuCourse | null): number {
  return course === null ? MENU_COURSES.length : MENU_COURSES.indexOf(course);
}

export function compareMenuItems(
  a: { course: MenuCourse | null; name: string },
  b: { course: MenuCourse | null; name: string },
): number {
  return courseRank(a.course) - courseRank(b.course) || compareDishNames(a.name, b.name);
}

// The course heading (null = „Bez kursu” / „No course”).
export function courseLabel(course: MenuCourse | null, locale: Locale = "pl"): string {
  const t = menuMessages(locale);
  return course === null ? t.otherCourse : t.courses[course];
}

// Consecutive groups by course in the fixed order; the input is sorted first (stable within a course).
export function groupByCourse<T extends { course: MenuCourse | null }>(
  items: readonly T[],
): { course: MenuCourse | null; items: T[] }[] {
  const groups: { course: MenuCourse | null; items: T[] }[] = [];
  const sorted = [...items].sort((a, b) => courseRank(a.course) - courseRank(b.course));
  for (const item of sorted) {
    const last = groups.at(-1);
    if (last?.course === item.course) {
      last.items.push(item);
    } else {
      groups.push({ course: item.course, items: [item] });
    }
  }
  return groups;
}

export interface MenuItemInput {
  name: string;
  course: MenuCourse;
  priceGrosze: number;
}

export type MenuInputResult<T> = { ok: true; value: T } | { ok: false; message: string };

// A catalog item's fields as typed (only the given ones are checked; first problem wins).
export function parseMenuItemPatch(
  raw: { name?: string; course?: string; price?: string },
  locale: Locale = "pl",
): MenuInputResult<Partial<MenuItemInput>> {
  const value: Partial<MenuItemInput> = {};
  if (raw.name !== undefined) {
    const name = parseDishName(raw.name, locale);
    if (!name.ok) {
      return name;
    }
    value.name = name.value;
  }
  if (raw.course !== undefined) {
    if (!isMenuCourse(raw.course)) {
      return { ok: false, message: menuMessages(locale).invalidCourse };
    }
    value.course = raw.course;
  }
  if (raw.price !== undefined) {
    const price = parseUnitPrice(raw.price, locale);
    if (!price.ok) {
      return price;
    }
    value.priceGrosze = price.grosze;
  }
  return { ok: true, value };
}

export function parseMenuItemInput(
  raw: { name: string; course: string; price: string },
  locale: Locale = "pl",
): MenuInputResult<MenuItemInput> {
  const parsed = parseMenuItemPatch(raw, locale);
  if (!parsed.ok) {
    return parsed;
  }
  const { name, course, priceGrosze } = parsed.value;
  if (name === undefined || course === undefined || priceGrosze === undefined) {
    return { ok: false, message: menuMessages(locale).invalidCourse };
  }
  return { ok: true, value: { name, course, priceGrosze } };
}

// The items an event offers: none while off, the whole catalog for full, the chosen ones for reduced.
export function availableItems<T extends { id: number }>(
  mode: EventMenuMode,
  catalog: readonly T[],
  chosen: ReadonlySet<number>,
): T[] {
  if (mode === "off") {
    return [];
  }
  return mode === "full" ? [...catalog] : catalog.filter((item) => chosen.has(item.id));
}

// The order form's menu: active while at least one item is available; prices are what a new line costs now —
// the event's price of that name when it has one (event first, client-restaurant-split), else the catalog's.
export function orderMenu(
  available: readonly MenuItemDto[],
  eventPriceOf: (name: string) => number | null,
): OrderMenuDto {
  const items: OrderMenuItemDto[] = [...available].sort(compareMenuItems).map((item) => ({
    name: item.name,
    course: item.course,
    priceGrosze: eventPriceOf(item.name) ?? item.priceGrosze,
  }));
  return { active: items.length > 0, items };
}

// The available item with that name (any letter case), or null.
export function findMenuItem<T extends { name: string }>(items: readonly T[], name: string): T | null {
  const key = dishKey(name);
  return key === "" ? null : (items.find((item) => dishKey(item.name) === key) ?? null);
}
