import { describe, expect, it } from "vitest";
import type { MenuItemDto } from "@/types";
import {
  availableItems,
  courseLabel,
  findMenuItem,
  groupByCourse,
  MENU_COURSES,
  orderMenu,
  parseMenuItemInput,
  parseMenuItemPatch,
} from "./rules";

const catalog: MenuItemDto[] = [
  { id: 1, name: "Sernik", course: "dessert", priceGrosze: 1_500 },
  { id: 2, name: "Rosół", course: "soup", priceGrosze: 1_800 },
  { id: 3, name: "Lemoniada", course: "drinks", priceGrosze: 1_200 },
  { id: 4, name: "Tatar", course: "starter", priceGrosze: 3_200 },
];

describe("menu rules (menu-catalog-courses)", () => {
  it("has the five courses in the kitchen's order with PL and EN labels", () => {
    expect(MENU_COURSES).toEqual(["starter", "soup", "main", "dessert", "drinks"]);
    expect(courseLabel("main")).toBe("Dania główne");
    expect(courseLabel("main", "en")).toBe("Mains");
    expect(courseLabel(null)).toBe("Bez kursu");
    expect(courseLabel(null, "en")).toBe("No course");
  });

  it("checks a catalog item like a dish: name, course, price as typed", () => {
    expect(parseMenuItemInput({ name: "  Rosół  z makaronem ", course: "soup", price: "18,50" })).toEqual({
      ok: true,
      value: { name: "Rosół z makaronem", course: "soup", priceGrosze: 1_850 },
    });
    expect(parseMenuItemInput({ name: "", course: "soup", price: "1" }).ok).toBe(false);
    expect(parseMenuItemInput({ name: "Rosół", course: "breakfast", price: "1" })).toEqual({
      ok: false,
      message: "Wybierz kurs.",
    });
    expect(parseMenuItemInput({ name: "Rosół", course: "soup", price: "abc" }).ok).toBe(false);
    expect(parseMenuItemPatch({ price: "20" }, "en")).toEqual({ ok: true, value: { priceGrosze: 2_000 } });
  });

  it("offers nothing (off), everything (full) or the chosen items (reduced)", () => {
    expect(availableItems("off", catalog, new Set([1]))).toEqual([]);
    expect(availableItems("full", catalog, new Set())).toHaveLength(4);
    expect(availableItems("reduced", catalog, new Set([2, 3])).map((item) => item.id)).toEqual([2, 3]);
  });

  it("builds the order form's menu by course with the event's price first, without ids", () => {
    const menu = orderMenu(catalog, (name) => (name === "Rosół" ? 1_600 : null));
    expect(menu.active).toBe(true);
    expect(menu.items).toEqual([
      { name: "Tatar", course: "starter", priceGrosze: 3_200 },
      { name: "Rosół", course: "soup", priceGrosze: 1_600 },
      { name: "Sernik", course: "dessert", priceGrosze: 1_500 },
      { name: "Lemoniada", course: "drinks", priceGrosze: 1_200 },
    ]);
    expect(orderMenu([], () => null)).toEqual({ active: false, items: [] });
  });

  it("finds a dish on the menu in any letter case and groups by course", () => {
    expect(findMenuItem(catalog, "ROSÓŁ")?.id).toBe(2);
    expect(findMenuItem(catalog, "Schabowy")).toBeNull();
    expect(findMenuItem(catalog, "   ")).toBeNull();
    const groups = groupByCourse([
      { course: null, name: "x" },
      { course: "drinks" as const, name: "y" },
      { course: "starter" as const, name: "z" },
      { course: "starter" as const, name: "w" },
    ]);
    expect(groups.map((group) => [group.course, group.items.length])).toEqual([
      ["starter", 2],
      ["drinks", 1],
      [null, 1],
    ]);
  });
});
