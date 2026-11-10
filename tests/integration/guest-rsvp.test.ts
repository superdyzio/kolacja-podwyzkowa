import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getGuestState, getGuestStateVersion } from "@/lib/guest-links";
import { addGuests, deleteGuest, updateGuest } from "@/lib/guests";
import { addMenuItem, deleteMenuItem, setEventMenu } from "@/lib/menu/service";
import {
  getGuestRsvp,
  getRsvpBoard,
  saveRsvpByOrganizer,
  submitGuestRsvp,
  updateRsvpSettings,
} from "@/lib/rsvp/service";
import type { DbClient } from "@/lib/supabase-client";
import { createTestEvent, hasLocalDb, localDb, releaseTestEvent, type TestEvent } from "./helpers";

// guest-rsvp-menu (S-25; FR-039): a guest answers until the deadline (checked in the database), the client always;
// attendance is guest.is_absent (one truth), the dish one of the options the event's menu offers; another event's
// guest is unknown; the guest's poll token is the same on the 204 and the 200 path and changes with the RSVP.

describe.skipIf(!hasLocalDb)("guest RSVP (integration)", () => {
  let db: DbClient;
  let a: TestEvent;
  let b: TestEvent;
  const guest: Record<string, { id: number; displayName: string }> = {};
  const item: Record<string, number> = {};
  let foreignGuest = 0;
  const future = () => new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

  async function menuItem(event: TestEvent, name: string, course: "main" | "dessert" | "starter") {
    const result = await addMenuItem(db, event.restaurantId, { name, course, priceGrosze: 4_200 });
    if (result.status !== "added") {
      throw new Error(`menu item ${name}: ${result.status}`);
    }
    return result.id;
  }

  async function isAbsent(id: number): Promise<boolean> {
    const { data, error } = await db.from("guest").select("is_absent").eq("id", id).single();
    if (error) {
      throw new Error(error.message);
    }
    return data.is_absent;
  }

  beforeAll(async () => {
    db = localDb();
    a = await createTestEvent(db, "rsvp A");
    b = await createTestEvent(db, "rsvp B");
    const added = await addGuests(db, a.id, ["Ania RSVP", "Bartek RSVP", "Celina RSVP", "Darek RSVP"]);
    if (added.status !== "added") {
      throw new Error(added.status);
    }
    for (const row of added.added) {
      guest[row.displayName.split(" ")[0]] = { id: row.id, displayName: row.displayName };
    }
    const other = await addGuests(db, b.id, ["Obcy RSVP"]);
    if (other.status !== "added") {
      throw new Error(other.status);
    }
    foreignGuest = other.added[0].id;
    item.schab = await menuItem(a, "Schab RSVP", "main");
    item.losos = await menuItem(a, "Łosoś RSVP", "main");
    item.sernik = await menuItem(a, "Sernik RSVP", "dessert");
    item.foreign = await menuItem(b, "Pierogi RSVP", "main");
  });

  afterAll(async () => {
    await releaseTestEvent(db, a);
    await releaseTestEvent(db, b);
  });

  it("is off by default: nothing on the phone, a guest's answer refused, the board empty", async () => {
    expect(await getGuestRsvp(db, a.id, guest.Ania.id)).toBeNull();
    expect((await submitGuestRsvp(db, a.id, guest.Ania.id, true, null)).status).toBe("closed");
    const board = await getRsvpBoard(db, a.id, new Date());
    expect(board?.deadline).toBeNull();
    expect(board?.counts).toMatchObject({ total: 4, coming: 0, notComing: 0, noAnswer: 4 });
    expect(board?.menu.map((option) => option.name)).toEqual(["Łosoś RSVP", "Schab RSVP", "Sernik RSVP"]);
  });

  it("takes options only from the event's available menu", async () => {
    expect((await setEventMenu(db, a.id, "reduced", [item.schab, item.losos])).status).toBe("updated");
    const now = new Date();
    expect(await updateRsvpSettings(db, a.id, { options: ["Sernik RSVP"] }, now)).toEqual({
      status: "not-on-menu",
      name: "Sernik RSVP",
    });
    expect(await updateRsvpSettings(db, a.id, { options: ["Pierogi RSVP"] }, now)).toEqual({
      status: "not-on-menu",
      name: "Pierogi RSVP",
    });
    // The DB function itself refuses another restaurant's item.
    const foreign = await db.rpc("set_event_rsvp_options", { p_event_id: a.id, p_item_ids: [item.foreign] });
    expect(foreign.error?.message).toContain("ITEM_NOT_FOUND");
    expect(
      (await updateRsvpSettings(db, a.id, { options: ["schab rsvp", "Łosoś RSVP"], deadline: future() }, now)).status,
    ).toBe("updated");
    const board = await getRsvpBoard(db, a.id, new Date());
    expect(board?.open).toBe(true);
    expect(board?.options).toEqual([
      { name: "Łosoś RSVP", course: "main", available: true },
      { name: "Schab RSVP", course: "main", available: true },
    ]);
    // Another event's id never reaches A's options.
    expect((await updateRsvpSettings(db, -1, { options: [] }, now)).status).toBe("not-found");
  });

  it("lets a guest answer before the deadline; „no” marks them absent and drops the dish", async () => {
    expect((await submitGuestRsvp(db, a.id, guest.Ania.id, true, "schab rsvp")).status).toBe("saved");
    expect(await isAbsent(guest.Ania.id)).toBe(false);
    const ania = await getGuestRsvp(db, a.id, guest.Ania.id);
    expect(ania).toMatchObject({ open: true, attending: true, dish: "Schab RSVP", byOrganizer: false });
    expect(ania?.options.map((option) => option.name)).toEqual(["Łosoś RSVP", "Schab RSVP"]);

    expect((await submitGuestRsvp(db, a.id, guest.Bartek.id, true, "Sernik RSVP")).status).toBe("not-offered");
    expect((await submitGuestRsvp(db, a.id, guest.Bartek.id, false, "Schab RSVP")).status).toBe("saved");
    expect(await isAbsent(guest.Bartek.id)).toBe(true);
    expect(await getGuestRsvp(db, a.id, guest.Bartek.id)).toMatchObject({ attending: false, dish: null });

    // Changing one's mind before the deadline.
    expect((await submitGuestRsvp(db, a.id, guest.Bartek.id, true, "Łosoś RSVP")).status).toBe("saved");
    expect(await isAbsent(guest.Bartek.id)).toBe(false);
    expect((await submitGuestRsvp(db, a.id, guest.Bartek.id, false, null)).status).toBe("saved");

    const board = await getRsvpBoard(db, a.id, new Date());
    expect(board?.counts).toMatchObject({ total: 4, coming: 1, notComing: 1, noAnswer: 2, noDish: 0 });
    expect(board?.counts.dishes).toEqual([{ name: "Schab RSVP", course: "main", count: 1, offered: true }]);
  });

  it("treats another event's guest as unknown", async () => {
    expect((await submitGuestRsvp(db, a.id, foreignGuest, true, null)).status).toBe("not-found");
    expect((await saveRsvpByOrganizer(db, a.id, foreignGuest, true, null)).status).toBe("not-found");
    expect(await getGuestRsvp(db, a.id, foreignGuest)).toBeNull();
    expect((await saveRsvpByOrganizer(db, b.id, guest.Ania.id, false, null)).status).toBe("not-found");
    expect(await isAbsent(guest.Ania.id)).toBe(false);
  });

  it("stamps an answer as the organizer's when the guest list changes the absence", async () => {
    expect((await updateGuest(db, a.id, guest.Ania.id, { isAbsent: true })).status).toBe("updated");
    expect(await getGuestRsvp(db, a.id, guest.Ania.id)).toMatchObject({
      attending: false,
      dish: null,
      byOrganizer: true,
    });
    expect((await updateGuest(db, a.id, guest.Ania.id, { isAbsent: false })).status).toBe("updated");
    // Present again: the answer and its dish count again, decided by the organizer.
    expect(await getGuestRsvp(db, a.id, guest.Ania.id)).toMatchObject({
      attending: true,
      dish: "Schab RSVP",
      byOrganizer: true,
    });
    // An absence marked without any answer is the organizer's „no”.
    expect((await updateGuest(db, a.id, guest.Darek.id, { isAbsent: true })).status).toBe("updated");
    expect(await getGuestRsvp(db, a.id, guest.Darek.id)).toMatchObject({ attending: false, byOrganizer: true });
  });

  it("closes for guests at the deadline; the client still answers and clears", async () => {
    expect((await updateRsvpSettings(db, a.id, { close: true }, new Date())).status).toBe("updated");
    const board = await getRsvpBoard(db, a.id, new Date());
    expect(board?.open).toBe(false);
    expect((await getGuestRsvp(db, a.id, guest.Celina.id))?.open).toBe(false);
    expect((await submitGuestRsvp(db, a.id, guest.Celina.id, true, null)).status).toBe("closed");

    expect((await saveRsvpByOrganizer(db, a.id, guest.Celina.id, true, "Łosoś RSVP")).status).toBe("saved");
    expect(await getGuestRsvp(db, a.id, guest.Celina.id)).toMatchObject({
      attending: true,
      dish: "Łosoś RSVP",
      byOrganizer: true,
    });
    expect((await saveRsvpByOrganizer(db, a.id, guest.Darek.id, null, null)).status).toBe("saved");
    expect(await isAbsent(guest.Darek.id)).toBe(false);
    expect(await getGuestRsvp(db, a.id, guest.Darek.id)).toMatchObject({ attending: null, byOrganizer: false });
    expect((await saveRsvpByOrganizer(db, a.id, guest.Darek.id, true, "Sernik RSVP")).status).toBe("not-offered");
  });

  it("keeps the token equal on both poll paths and changes it with the deadline and the answer", async () => {
    const celina = guest.Celina;
    const closed = await getGuestState(db, a.id, celina);
    expect(closed.rsvp?.open).toBe(false);
    expect(await getGuestStateVersion(db, a.id, celina)).toBe(closed.version);

    expect((await updateRsvpSettings(db, a.id, { deadline: future() }, new Date())).status).toBe("updated");
    const reopened = await getGuestState(db, a.id, celina);
    expect(reopened.rsvp?.open).toBe(true);
    expect(reopened.version).not.toBe(closed.version);
    expect(await getGuestStateVersion(db, a.id, celina)).toBe(reopened.version);

    expect((await submitGuestRsvp(db, a.id, celina.id, true, "Schab RSVP")).status).toBe("saved");
    const answered = await getGuestState(db, a.id, celina);
    expect(answered.version).not.toBe(reopened.version);
    expect(await getGuestStateVersion(db, a.id, celina)).toBe(answered.version);

    // Off: nothing on the phone, the token back to the RSVP-less form.
    expect((await updateRsvpSettings(db, a.id, { deadline: null }, new Date())).status).toBe("updated");
    const off = await getGuestState(db, a.id, celina);
    expect(off.rsvp).toBeNull();
    expect(await getGuestStateVersion(db, a.id, celina)).toBe(off.version);
  });

  it("keeps an answer without a dish when the catalog item is deleted, and drops it with the guest", async () => {
    expect((await updateRsvpSettings(db, a.id, { deadline: future() }, new Date())).status).toBe("updated");
    expect((await deleteMenuItem(db, a.restaurantId, item.losos)).status).toBe("deleted");
    const board = await getRsvpBoard(db, a.id, new Date());
    expect(board?.options.map((option) => option.name)).toEqual(["Schab RSVP"]);
    // Celina chose the schab last; Bartek said no.
    expect(board?.guests.find((row) => row.id === guest.Celina.id)?.dish).toBe("Schab RSVP");
    expect((await saveRsvpByOrganizer(db, a.id, guest.Bartek.id, true, "Schab RSVP")).status).toBe("saved");
    expect((await deleteMenuItem(db, a.restaurantId, item.schab)).status).toBe("deleted");
    const after = await getRsvpBoard(db, a.id, new Date());
    expect(after?.counts).toMatchObject({ coming: 3, noDish: 3, dishes: [] });

    expect((await deleteGuest(db, a.id, guest.Bartek.id)).status).toBe("deleted");
    const { count } = await db
      .from("guest_rsvp")
      .select("guest_id", { count: "exact", head: true })
      .eq("guest_id", guest.Bartek.id);
    expect(count).toBe(0);
  });
});
