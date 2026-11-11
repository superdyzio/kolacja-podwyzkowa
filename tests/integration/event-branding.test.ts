import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  deleteEventLogo,
  deleteRestaurantLogo,
  getEventBranding,
  getLogoOfEvent,
  getRestaurantBranding,
  saveEventLogo,
  saveRestaurantLogo,
  setEventBrandName,
  updateRestaurantBranding,
} from "@/lib/branding";
import { MAX_LOGO_BYTES } from "@/lib/branding/rules";
import { createTestEvent, hasLocalDb, localDb, releaseTestEvent, TINY_PNG, type TestEvent } from "./helpers";

// event-branding (S-18): the restaurant's and the client's brand stay inside their own tenant — two restaurants with
// one event each; a logo, a name or a colour of A never shows through B, logos are sniffed and capped.
describe.skipIf(!hasLocalDb)("event branding (local DB)", () => {
  const db = hasLocalDb ? localDb() : (null as never);
  let a: TestEvent;
  let b: TestEvent;

  beforeAll(async () => {
    a = await createTestEvent(db, "marka A");
    b = await createTestEvent(db, "marka B");
  });

  afterAll(async () => {
    await releaseTestEvent(db, a);
    await releaseTestEvent(db, b);
  });

  it("starts unbranded: restaurant name only, no colour, no logos, no client name", async () => {
    const branding = await getEventBranding(db, a.id);
    expect(branding?.restaurant.color).toBeNull();
    expect(branding?.restaurant.textColor).toBeNull();
    expect(branding?.restaurant.logo).toBeNull();
    expect(branding?.client).toEqual({ name: null, logo: null });
    expect(await getLogoOfEvent(db, a.id, "event")).toBeNull();
    expect(await getLogoOfEvent(db, a.id, "restaurant")).toBeNull();
  });

  it("keeps A's restaurant brand and client brand away from B", async () => {
    await updateRestaurantBranding(db, a.restaurantId, { color: "#1e3a8a", name: `Lokal A ${String(a.id)}` });
    expect(await saveRestaurantLogo(db, a.restaurantId, TINY_PNG)).toEqual({ status: "saved" });
    await setEventBrandName(db, a.id, "Acme sp. z o.o.");
    expect(await saveEventLogo(db, a.id, TINY_PNG)).toEqual({ status: "saved" });

    const brandA = await getEventBranding(db, a.id);
    expect(brandA?.restaurant).toMatchObject({
      name: `Lokal A ${String(a.id)}`,
      color: "#1e3a8a",
      textColor: "#ffffff",
    });
    expect(brandA?.restaurant.logo).toMatchObject({ mimeType: "image/png", byteSize: TINY_PNG.length });
    expect(brandA?.client.name).toBe("Acme sp. z o.o.");
    expect(brandA?.client.logo?.mimeType).toBe("image/png");
    expect(Array.from((await getLogoOfEvent(db, a.id, "restaurant"))?.bytes ?? [])).toEqual(Array.from(TINY_PNG));
    expect(Array.from((await getLogoOfEvent(db, a.id, "event"))?.bytes ?? [])).toEqual(Array.from(TINY_PNG));

    const brandB = await getEventBranding(db, b.id);
    expect(brandB?.restaurant.color).toBeNull();
    expect(brandB?.restaurant.logo).toBeNull();
    expect(brandB?.client).toEqual({ name: null, logo: null });
    expect(await getLogoOfEvent(db, b.id, "event")).toBeNull();
    expect(await getLogoOfEvent(db, b.id, "restaurant")).toBeNull();
    expect((await getRestaurantBranding(db, b.restaurantId))?.logo).toBeNull();
  });

  it("refuses SVG, HTML and oversized logos and saves nothing", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(await saveEventLogo(db, b.id, svg)).toEqual({ status: "unsupported-type" });
    expect(await saveRestaurantLogo(db, b.restaurantId, new TextEncoder().encode("<html></html>"))).toEqual({
      status: "unsupported-type",
    });
    const huge = new Uint8Array(MAX_LOGO_BYTES + 1);
    huge.set(TINY_PNG);
    expect(await saveEventLogo(db, b.id, huge)).toEqual({ status: "too-large" });
    expect(await getLogoOfEvent(db, b.id, "event")).toBeNull();
  });

  it("the database refuses a malformed colour or an over-long brand name", async () => {
    const colour = await db.from("restaurant").update({ brand_color: "red" }).eq("id", b.restaurantId);
    expect(colour.error).not.toBeNull();
    const name = await db
      .from("event")
      .update({ brand_name: "x".repeat(81) })
      .eq("id", b.id);
    expect(name.error).not.toBeNull();
  });

  it("removes logos and clears the name and colour", async () => {
    await deleteEventLogo(db, a.id);
    await deleteRestaurantLogo(db, a.restaurantId);
    await setEventBrandName(db, a.id, null);
    await updateRestaurantBranding(db, a.restaurantId, { color: null });
    const branding = await getEventBranding(db, a.id);
    expect(branding?.restaurant.logo).toBeNull();
    expect(branding?.restaurant.color).toBeNull();
    expect(branding?.client).toEqual({ name: null, logo: null });
  });

  it("has no brand for a venue template or an unknown event", async () => {
    const template = await db
      .from("event")
      .insert({ restaurant_id: a.restaurantId, name: "Szablon marki", is_template: true })
      .select("id")
      .single();
    expect(template.error).toBeNull();
    const templateId = template.data?.id ?? 0;
    try {
      expect(await getEventBranding(db, templateId)).toBeNull();
      expect(await getLogoOfEvent(db, templateId, "restaurant")).toBeNull();
      expect(await getEventBranding(db, 999_999_999)).toBeNull();
    } finally {
      await db.from("event").delete().eq("id", templateId);
    }
  });
});
