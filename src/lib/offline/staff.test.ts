import { describe, expect, it } from "vitest";
import type { OrderBoardDto, OrderItemDto, RestaurantViewDto, StaffReadoutDto } from "@/types";
import {
  STAFF_READOUT_STORAGE_KEYS,
  floorReadoutScope,
  isAppDenial,
  isStaffReadout,
  isStaffReadoutApiBase,
  liveStaffEntry,
  parseStaffOfflineEntry,
  readStaffReadoutOnce,
  serializeStaffOfflineEntry,
  staffOfflineEntry,
  staffReadoutFromBoard,
  staffReadoutFromView,
  tabletReadoutScope,
  waiterReadoutScope,
} from "./staff";
import { staffOfflineMessages } from "./staff-messages";

// The staff's offline readout (staff-offline-readout, S-27): the copy (no prices, ids, keys or marks), its validation,
// the owner and expiry of every scope, and the one-shot read. Fixed instants only. 2026-11-14 is a Saturday (CET).

const KEY = "AAAAAAAAAAAAAAAAAAAAAAAA";
const OTHER_KEY = "BBBBBBBBBBBBBBBBBBBBBBBB";
const EVENT_DATE = "2026-11-14";
const WINDOW_END = "2026-11-15T11:00:00.000Z";
const SAVED_AT = "2026-11-14T20:34:00.000Z";

const seating: RestaurantViewDto["seating"] = {
  version: "3.17",
  planVersion: 17,
  publishedAt: "2026-11-14T18:05:00.000Z",
  chairPitch: 0.035,
  rooms: [{ name: "Sala duża", x: 0.1, y: 0.1, width: 0.5, height: 0.6 }],
  tables: [
    {
      name: "Okno",
      room: "Sala duża",
      shape: "round",
      seatCount: 4,
      x: 0.3,
      y: 0.4,
      rotation: 0,
      seats: [
        { seat: 1, name: "Ania" },
        { seat: 2, name: "Bartek" },
      ],
    },
  ],
};

const diets: RestaurantViewDto["diets"] = {
  tables: [
    {
      name: "Okno",
      room: "Sala duża",
      seats: [{ seat: 1, guestName: "Ania", diets: ["vegan", "nut-allergy"], note: "bez sezamu" }],
    },
  ],
  unplaced: [],
  counts: [
    { tag: "vegan", count: 1 },
    { tag: "nut-allergy", count: 1 },
  ],
  guests: 1,
};

function line(overrides: Partial<OrderItemDto>): OrderItemDto {
  return {
    id: 41,
    name: "Pierogi",
    course: "main",
    note: null,
    quantity: 2,
    unitPriceGrosze: 3200,
    guestId: 7,
    tableId: null,
    delivered: false,
    deliveredPieces: [1],
    marks: [{ piece: 1, by: "guest", guestId: 7 }],
    ...overrides,
  };
}

const pierogi = line({});
const wine = line({
  id: 42,
  name: "Karafka wina",
  course: "drinks",
  quantity: 1,
  guestId: null,
  tableId: 9,
  delivered: true,
  deliveredPieces: [1],
  marks: [{ piece: 1, by: "organizer", guestId: null }],
});

const board: OrderBoardDto = {
  items: [pierogi, wine],
  guests: [{ id: 7, displayName: "Ania", isAbsent: false, seat: { table: "Okno", seat: 1 } }],
  tables: [{ id: 9, name: "Okno", room: "Sala duża", published: true }],
  published: true,
  seating,
  placement: {
    tables: [
      {
        name: "Okno",
        room: "Sala duża",
        seats: [{ seat: 1, guestName: "Ania", items: [pierogi] }],
        tableItems: [wine],
      },
    ],
    unplaced: [],
    unassigned: [],
  },
  prep: [
    { course: "main", name: "Pierogi", quantity: 2, toServe: 1, notes: [], totalGrosze: 6400 },
    { course: "drinks", name: "Karafka wina", quantity: 1, toServe: 0, notes: [], totalGrosze: 3200 },
  ],
  totals: { lines: 2, quantity: 3, deliveredQuantity: 2, totalGrosze: 9600 },
  drinks: [{ id: 3, name: "Woda", quantity: 2, unitPriceGrosze: 900 }],
  drinkTotals: { lines: 1, quantity: 2, totalGrosze: 1800 },
  menu: { active: true, items: [{ name: "Pierogi", course: "main", priceGrosze: 3200 }] },
  diets,
};

const view: RestaurantViewDto = {
  version: "abc.1",
  seating,
  prep: [
    { course: "main", name: "Pierogi", quantity: 2, toServe: 1, notes: [] },
    { course: "drinks", name: "Karafka wina", quantity: 1, toServe: 0, notes: [] },
  ],
  placement: {
    tables: [
      {
        name: "Okno",
        room: "Sala duża",
        seats: [
          {
            seat: 1,
            guestName: "Ania",
            items: [{ name: "Pierogi", note: null, quantity: 2, delivered: false, deliveredPieces: [1] }],
          },
        ],
        tableItems: [{ name: "Karafka wina", note: null, quantity: 1, delivered: true, deliveredPieces: [1] }],
      },
    ],
    unplaced: [],
    unassigned: [],
  },
  totals: { quantity: 3, toServe: 1 },
  diets,
};

const ASPECT = { planVersion: 17, aspect: 4 / 3 };

describe("the copy", () => {
  it("keeps the floor's board as the tablet sees it: no ids, prices, marks, guests' or tables' lists, drinks or menu", () => {
    const copy = staffReadoutFromBoard(board, ASPECT);
    const keys = new Set<string>();
    JSON.stringify(copy, (key: string, value: unknown) => {
      keys.add(key);
      return value;
    });
    for (const field of ["id", "unitPriceGrosze", "totalGrosze", "guestId", "tableId", "marks", "menu", "drinks"]) {
      expect(keys.has(field)).toBe(false);
    }
    expect(JSON.stringify(copy)).not.toContain("Woda");
    expect(isStaffReadout(copy)).toBe(true);
  });

  it("is the same for the tablet's view and the floor's board of the same lines", () => {
    expect(staffReadoutFromBoard(board, ASPECT)).toEqual(staffReadoutFromView(view, ASPECT));
    expect(staffReadoutFromView(view, null)).not.toHaveProperty("version");
  });

  it("keeps the diets, the delivered pieces and the published names", () => {
    const copy = staffReadoutFromBoard(board, null);
    expect(copy.diets.tables[0]?.seats[0]?.diets).toEqual(["vegan", "nut-allergy"]);
    expect(copy.placement.tables[0]?.seats[0]?.items[0]?.deliveredPieces).toEqual([1]);
    expect(copy.totals).toEqual({ quantity: 3, toServe: 1 });
    expect(copy.seating.tables[0]?.seats.map((seat) => seat.name)).toEqual(["Ania", "Bartek"]);
  });

  it("refuses anything odd", () => {
    const copy = staffReadoutFromView(view, ASPECT);
    const broken: unknown[] = [
      null,
      { ...copy, diets: undefined },
      { ...copy, totals: { quantity: 1, toServe: 2 } },
      { ...copy, planAspect: { planVersion: 17, aspect: 0 } },
      { ...copy, seating: { ...seating, tables: [{ ...seating.tables[0], seats: [{ seat: 1 }] }] } },
      { ...copy, prep: [{ ...view.prep[0], course: "breakfast" }] },
      { ...copy, diets: { ...diets, counts: [{ tag: "keto", count: 1 }] } },
      {
        ...copy,
        placement: { ...view.placement, unassigned: [{ name: "X", note: null, quantity: 0, delivered: false }] },
      },
    ];
    for (const value of broken) {
      expect(isStaffReadout(value)).toBe(false);
    }
  });
});

describe("scopes", () => {
  it("tablet: one per link, the live page and API of that link, the floor window's end", () => {
    const scope = tabletReadoutScope(KEY, EVENT_DATE);
    expect(scope).toMatchObject({
      area: "tablet",
      expiresAt: WINDOW_END,
      apiBase: `/api/r/${KEY}`,
      livePath: `/r/${KEY}`,
      readoutPath: `/r/${KEY}/odczyt`,
    });
    expect(scope.owner).toMatch(/^[0-9a-f]{8}$/);
    expect(scope.owner).not.toContain(KEY);
    expect(tabletReadoutScope(OTHER_KEY, EVENT_DATE).owner).not.toBe(scope.owner);
  });

  it("floor: bound to the event and the account", () => {
    const scope = floorReadoutScope(12, 5, EVENT_DATE);
    expect(scope).toMatchObject({
      area: "floor",
      expiresAt: WINDOW_END,
      apiBase: "/api/panel/events/12/obsluga",
      livePath: "/panel/obsluga/12",
      readoutPath: "/panel/obsluga/12/odczyt",
    });
    expect(floorReadoutScope(12, 6, EVENT_DATE).owner).not.toBe(scope.owner);
    expect(floorReadoutScope(13, 5, EVENT_DATE).owner).not.toBe(scope.owner);
  });

  it("waiter: bound to the event and the waiter; the earlier of the window's end and the waiter's expiry", () => {
    const scope = waiterReadoutScope(12, 3, EVENT_DATE, WINDOW_END);
    expect(scope).toMatchObject({
      area: "waiter",
      expiresAt: WINDOW_END,
      apiBase: "/api/kelner/sala/12",
      livePath: "/kelner/sala/12",
      readoutPath: "/kelner/sala/12/odczyt",
    });
    expect(waiterReadoutScope(12, 4, EVENT_DATE, WINDOW_END).owner).not.toBe(scope.owner);
    // The event moved a day later: the waiter's own expiry still binds.
    expect(waiterReadoutScope(12, 3, "2026-11-15", WINDOW_END).expiresAt).toBe(WINDOW_END);
    expect(waiterReadoutScope(12, 3, "2026-11-13", WINDOW_END).expiresAt).toBe("2026-11-14T11:00:00.000Z");
  });

  it("different areas never share an owner, even for the same ids", () => {
    expect(floorReadoutScope(12, 3, EVENT_DATE).owner).not.toBe(
      waiterReadoutScope(12, 3, EVENT_DATE, WINDOW_END).owner,
    );
  });

  it("only the three live API bases keep a copy", () => {
    expect(isStaffReadoutApiBase("tablet", `/api/r/${KEY}`)).toBe(true);
    expect(isStaffReadoutApiBase("floor", "/api/panel/events/12/obsluga")).toBe(true);
    expect(isStaffReadoutApiBase("waiter", "/api/kelner/sala/12")).toBe(true);
    for (const base of [
      `/api/o/${KEY}`,
      "/api/panel/events/12/klient",
      "/api/panel/events/12/obsluga/orders",
      "/api/kelner/sala/0",
      `/api/r/${KEY}/orders`,
    ]) {
      expect(isStaffReadoutApiBase("tablet", base) || isStaffReadoutApiBase("floor", base)).toBe(false);
      expect(isStaffReadoutApiBase("waiter", base)).toBe(false);
    }
  });

  it("use fixed storage keys without any link key", () => {
    expect(Object.values(STAFF_READOUT_STORAGE_KEYS)).toEqual([
      "kolacja-podwyzkowa:odczyt:tablet",
      "kolacja-podwyzkowa:odczyt:sala",
      "kolacja-podwyzkowa:odczyt:kelner",
    ]);
  });
});

describe("the envelope", () => {
  const scope = floorReadoutScope(12, 5, EVENT_DATE);
  const data: StaffReadoutDto = staffReadoutFromBoard(board, ASPECT);

  it("round-trips through storage text", () => {
    const entry = staffOfflineEntry(scope, data, SAVED_AT);
    expect(entry).not.toBeNull();
    expect(parseStaffOfflineEntry(serializeStaffOfflineEntry(entry))).toEqual(entry);
  });

  it("is not made when it would already be expired (a tablet opened after the window keeps nothing)", () => {
    expect(staffOfflineEntry(scope, data, WINDOW_END)).toBeNull();
    expect(staffOfflineEntry(scope, data, "2026-11-16T09:00:00.000Z")).toBeNull();
  });

  it("is read only by its own scope and only before it expires", () => {
    const entry = staffOfflineEntry(scope, data, SAVED_AT);
    const before = new Date(Date.parse(WINDOW_END) - 1);
    expect(liveStaffEntry(entry, scope, before)).toBe(entry);
    expect(liveStaffEntry(entry, scope, new Date(WINDOW_END))).toBeNull();
    expect(liveStaffEntry(entry, floorReadoutScope(12, 6, EVENT_DATE), before)).toBeNull();
    expect(liveStaffEntry(entry, { area: "waiter", owner: scope.owner }, before)).toBeNull();
  });

  it("refuses corrupted or foreign text", () => {
    const entry = staffOfflineEntry(scope, data, SAVED_AT);
    const good = JSON.parse(serializeStaffOfflineEntry(entry)) as Record<string, unknown>;
    for (const raw of [
      null,
      "",
      "{",
      "null",
      JSON.stringify({ ...good, v: 2 }),
      JSON.stringify({ ...good, area: "tv" }),
      JSON.stringify({ ...good, owner: "" }),
      JSON.stringify({ ...good, expiresAt: "jutro" }),
      JSON.stringify({ ...good, data: { ...data, diets: null } }),
    ]) {
      expect(parseStaffOfflineEntry(raw)).toBeNull();
    }
  });
});

describe("the app's denial", () => {
  const guarded = { "X-Robots-Tag": "noindex, nofollow" };

  it("is a 404 or 401 carrying the guard's private header", () => {
    expect(isAppDenial(new Response(null, { status: 404, headers: guarded }))).toBe(true);
    expect(isAppDenial(new Response(null, { status: 401, headers: guarded }))).toBe(true);
    expect(isAppDenial(new Response(null, { status: 404 }))).toBe(false);
    expect(isAppDenial(new Response(null, { status: 403, headers: guarded }))).toBe(false);
    expect(isAppDenial(new Response(null, { status: 500, headers: guarded }))).toBe(false);
  });
});

describe("readStaffReadoutOnce", () => {
  const signal = new AbortController().signal;
  const floor = floorReadoutScope(12, 5, EVENT_DATE);
  const tablet = tabletReadoutScope(KEY, EVENT_DATE);

  function answering(response: () => Response) {
    const urls: string[] = [];
    return {
      urls,
      fetch: (input: string) => {
        urls.push(input);
        return Promise.resolve(response());
      },
    };
  }

  it("reads the floor's board and the tablet's view from <apiBase>/orders into the same copy", async () => {
    const floorFetch = answering(() => Response.json(board));
    const tabletFetch = answering(() => Response.json(view));
    const fromFloor = await readStaffReadoutOnce(floor, ASPECT, floorFetch.fetch, signal);
    const fromTablet = await readStaffReadoutOnce(tablet, ASPECT, tabletFetch.fetch, signal);
    expect(floorFetch.urls).toEqual(["/api/panel/events/12/obsluga/orders"]);
    expect(tabletFetch.urls).toEqual([`/api/r/${KEY}/orders`]);
    expect(fromFloor).toEqual({ status: "ok", data: staffReadoutFromBoard(board, ASPECT) });
    expect(fromTablet).toEqual(fromFloor);
  });

  it("says gone on the guard's 404 or 401, offline on anything else", async () => {
    const guarded = { "X-Robots-Tag": "noindex, nofollow" };
    const cases: [() => Response, string][] = [
      [() => Response.json({ error: "Brak dostępu" }, { status: 404, headers: guarded }), "gone"],
      [() => Response.json({ error: "Zaloguj się." }, { status: 401, headers: guarded }), "gone"],
      [() => new Response("Not Found", { status: 404 }), "offline"],
      [() => new Response("oops", { status: 502 }), "offline"],
      [() => new Response(null, { status: 204 }), "offline"],
      [() => new Response("<html>portal</html>", { status: 200 }), "offline"],
      [() => Response.json({ items: "nope" }), "offline"],
    ];
    for (const [response, status] of cases) {
      expect((await readStaffReadoutOnce(floor, null, answering(response).fetch, signal)).status).toBe(status);
    }
    const failing = () => Promise.reject(new TypeError("Failed to fetch"));
    expect((await readStaffReadoutOnce(floor, null, failing, signal)).status).toBe("offline");
  });
});

describe("texts", () => {
  it("exist in both languages", () => {
    for (const locale of ["pl", "en"] as const) {
      const t = staffOfflineMessages(locale);
      expect(t.heading.length).toBeGreaterThan(0);
      expect(Object.keys(t.backToLive)).toEqual(["tablet", "floor", "waiter"]);
      expect(t.expires("sob., 15.11.2026, 12:00")).toContain("12:00");
    }
    expect(staffOfflineMessages("en").heading).toBe("Offline readout");
  });
});
