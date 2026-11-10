import { describe, expect, it } from "vitest";
import { planRsvpOrders, type RsvpOrderLineSource, type RsvpOrderMenuItem } from "./orders";

// „Przenieś wybory do zamówień” (the PR #4 review's RSVP extras), pure: POST /orders' rules for every coming guest with
// a dish, skipping who already has that dish, blocked by a dish the active menu does not offer.

const menu: RsvpOrderMenuItem[] = [
  { id: 11, name: "Schab", course: "main", priceGrosze: 5_900 },
  { id: 12, name: "Tatar", course: "starter", priceGrosze: 3_200 },
];

const guests = [
  { id: 1, attending: true, dish: "Schab" },
  { id: 2, attending: true, dish: "tatar" },
  { id: 3, attending: true, dish: null },
  { id: 4, attending: false, dish: null },
  { id: 5, attending: null, dish: null },
  { id: 6, attending: true, dish: "Schab" },
];

describe("planRsvpOrders", () => {
  it("one line per coming guest with a dish: the menu's spelling, course and item, the menu's price", () => {
    const plan = planRsvpOrders(guests, [], menu);
    expect(plan).toEqual({
      lines: [
        { guestId: 1, name: "Schab", course: "main", menuItemId: 11, unitPriceGrosze: 5_900 },
        { guestId: 2, name: "Tatar", course: "starter", menuItemId: 12, unitPriceGrosze: 3_200 },
        { guestId: 6, name: "Schab", course: "main", menuItemId: 11, unitPriceGrosze: 5_900 },
      ],
      skipped: 0,
      notOnMenu: [],
    });
  });

  it("takes the event's newest price of the dish before the menu's (FR-027)", () => {
    const lines: RsvpOrderLineSource[] = [
      { id: 1, name: "schab", guestId: null, unitPriceGrosze: 6_500 },
      { id: 7, name: "SCHAB", guestId: null, unitPriceGrosze: 7_000 },
    ];
    const plan = planRsvpOrders(guests, lines, menu);
    expect(plan.lines.filter((line) => line.name === "Schab").map((line) => line.unitPriceGrosze)).toEqual([
      7_000, 7_000,
    ]);
  });

  it("skips a guest who already has a line of the dish (any letter case) — running it again adds nothing", () => {
    const first = planRsvpOrders(guests, [], menu);
    const lines: RsvpOrderLineSource[] = first.lines.map((line, index) => ({
      id: index + 1,
      name: line.name.toUpperCase(),
      guestId: line.guestId,
      unitPriceGrosze: line.unitPriceGrosze,
    }));
    expect(planRsvpOrders(guests, lines, menu)).toEqual({ lines: [], skipped: 3, notOnMenu: [] });
    // Another dish of the same guest, or the dish at the table, does not count as having it.
    const other = planRsvpOrders(
      guests,
      [
        { id: 1, name: "Tatar", guestId: 1, unitPriceGrosze: 3_200 },
        { id: 2, name: "Schab", guestId: null, unitPriceGrosze: 5_900 },
      ],
      menu,
    );
    expect(other.lines.map((line) => line.guestId)).toEqual([1, 2, 6]);
    expect(other.skipped).toBe(0);
  });

  it("blocks dishes the active menu does not offer (as answered, once, Polish order) and still plans the rest", () => {
    const plan = planRsvpOrders(
      [...guests, { id: 7, attending: true, dish: "Żurek" }, { id: 8, attending: true, dish: "żurek" }],
      [],
      [menu[1]],
    );
    expect(plan.notOnMenu).toEqual(["Schab", "Żurek"]);
    expect(plan.lines.map((line) => line.guestId)).toEqual([2]);
  });

  it("without an active menu: free text, no course or item, the event's price or 0", () => {
    const plan = planRsvpOrders(guests, [{ id: 1, name: "Tatar", guestId: null, unitPriceGrosze: 2_800 }], []);
    expect(plan.lines).toEqual([
      { guestId: 1, name: "Schab", course: null, menuItemId: null, unitPriceGrosze: 0 },
      { guestId: 2, name: "tatar", course: null, menuItemId: null, unitPriceGrosze: 2_800 },
      { guestId: 6, name: "Schab", course: null, menuItemId: null, unitPriceGrosze: 0 },
    ]);
    expect(plan.notOnMenu).toEqual([]);
  });
});
