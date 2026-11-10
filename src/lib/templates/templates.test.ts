import { describe, expect, it } from "vitest";
import { CLIENT_ROUTE_PATTERNS } from "@/lib/client-routes/match";
import type { RoomDto, TableDto, VenueDto } from "@/types";
import { templateMessages } from "./messages";
import { templateUpdatePreview } from "./preview";
import { parseTemplateName, TEMPLATE_ROUTE_PATTERNS, templateMayRun } from "./rules";

function room(id: number, name: string): RoomDto {
  return { id, name, outline: null };
}

function table(id: number, roomId: number, name: string, seatCount: number): TableDto {
  return { id, roomId, name, seatCount, shape: "round", x: 0.5, y: 0.5, rotation: 0 };
}

const plan = { mimeType: "image/png" as const, byteSize: 10, version: 1 };

function venue(rooms: RoomDto[], tables: TableDto[], withPlan = true): VenueDto {
  return { plan: withPlan ? plan : null, rooms, tables, chairPitch: 0.035 };
}

describe("template routes", () => {
  it("are organizer routes the client dispatcher knows", () => {
    for (const pattern of TEMPLATE_ROUTE_PATTERNS) {
      expect(CLIENT_ROUTE_PATTERNS).toContain(pattern);
    }
  });

  it("run venue routes with any method and the seating board only for reads", () => {
    expect(templateMayRun("tables/:id", "PATCH")).toBe(true);
    expect(templateMayRun("plan", "PUT")).toBe(true);
    expect(templateMayRun("seating", "GET")).toBe(true);
    expect(templateMayRun("seating", "POST")).toBe(false);
    expect(templateMayRun("seating/publish", "POST")).toBe(false);
    expect(templateMayRun("guests", "GET")).toBe(false);
    expect(templateMayRun("guest-links", "GET")).toBe(false);
    expect(templateMayRun("orders", "GET")).toBe(false);
  });
});

describe("template names", () => {
  it("follow the event name rule", () => {
    expect(parseTemplateName("  Sala   główna ")).toEqual({ ok: true, name: "Sala główna" });
    expect(parseTemplateName("   ")).toEqual({ ok: false, reason: "empty" });
    expect(parseTemplateName("x".repeat(121))).toEqual({ ok: false, reason: "too-long" });
  });
});

describe("templateUpdatePreview", () => {
  const event = venue(
    [room(1, "Sala główna"), room(2, "Ogród")],
    [table(10, 1, "A", 8), table(11, 1, "B", 6), table(12, 2, "Altana", 4)],
  );
  const occupancy = [
    { tableId: 10, seat: 1, guestName: "Ania" },
    { tableId: 10, seat: 7, guestName: "Bartek" },
    { tableId: 11, seat: 6, guestName: "Celina" },
    { tableId: 12, seat: 2, guestName: "Darek" },
  ];

  it("matches by name case-insensitively and names everyone who loses a seat", () => {
    const template = venue(
      [room(20, "SALA GŁÓWNA"), room(21, "Taras")],
      [table(30, 20, "a", 6), table(31, 20, "B", 6), table(32, 21, "Nowy", 10)],
    );
    const preview = templateUpdatePreview(event, occupancy, template, { id: 5, name: "Sala letnia" });
    expect(preview).toEqual({
      templateId: 5,
      templateName: "Sala letnia",
      lost: [
        { guestName: "Bartek", table: "A", seat: 7 },
        { guestName: "Darek", table: "Altana", seat: 2 },
      ],
      tablesAdded: ["Nowy"],
      tablesRemoved: ["Altana"],
      tablesResized: ["A"],
      roomsAdded: ["Taras"],
      roomsRemoved: ["Ogród"],
      planChange: "replaced",
    });
  });

  it("says when the template has no plan and when nobody loses a seat", () => {
    const template = venue([room(20, "Sala główna"), room(21, "Ogród")], event.tables, false);
    const preview = templateUpdatePreview(event, occupancy, template, { id: 5, name: "Kopia" });
    expect(preview.lost).toEqual([]);
    expect(preview.planChange).toBe("removed");
    expect(templateUpdatePreview(venue([], [], false), [], venue([], [], false), { id: 1, name: "x" }).planChange).toBe(
      "none",
    );
  });
});

describe("templateMessages", () => {
  it("count rooms, tables and seats in both languages", () => {
    const summary = { roomCount: 1, tableCount: 5, seatCount: 2, hasPlan: false };
    expect(templateMessages("pl").counts(summary)).toBe("1 sala · 5 stolików · 2 miejsca · bez planu");
    expect(templateMessages("en").counts(summary)).toBe("1 room · 5 tables · 2 seats · no plan");
  });

  it("confirm names who loses a seat", () => {
    expect(templateMessages("pl").confirmApply("Sala", ["Ania", "Bartek"])).toContain("Miejsce stracą: Ania, Bartek.");
    expect(templateMessages("en").confirmApply("Hall", [])).toContain("Nobody loses a seat.");
  });
});
