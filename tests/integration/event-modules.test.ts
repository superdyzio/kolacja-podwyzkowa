import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveAccess } from "@/lib/access";
import { createStaffAccount, getSession, issueStaffToken, redeemStaffToken } from "@/lib/auth";
import type { StaffSession } from "@/lib/auth/types";
import { createEvent, createRestaurant } from "@/lib/event";
import { getQuestionList } from "@/lib/questions";
import { getEventModules, setModuleAvailable, setModuleEnabled, unlockEventModule } from "@/lib/modules";
import type { DbClient } from "@/lib/supabase-client";
import { beginSupport, endSupport, getSupportLog } from "@/lib/support";
import { hasLocalDb, localDb, testTag } from "./helpers";

// event-modules (S-17): the DB defaults of a new event, the client's switch and the venue's offer (data kept), the
// access carrying the working modules, and the administrator's unlock inside a support visit only (logged for the
// owner). Cleanup: events first (event.restaurant_id does not cascade), then restaurants, then accounts.

const PASSWORD = "haslo-modulow-123";

describe.skipIf(!hasLocalDb)("event modules (integration)", () => {
  let db: DbClient;
  const tag = testTag();
  const restaurantIds: number[] = [];
  const eventIds: number[] = [];
  const accountIds: number[] = [];

  async function newEvent(label: string) {
    const restaurant = await createRestaurant(db, `Moduły ${label} ${tag}`);
    restaurantIds.push(restaurant.id);
    const created = await createEvent(db, { restaurantId: restaurant.id, name: `Moduły ${label} ${tag}` });
    if (created.status !== "created") throw new Error(created.status);
    eventIds.push(created.event.id);
    return { restaurantId: restaurant.id, event: created.event };
  }

  async function adminSession(): Promise<StaffSession> {
    const email = `admin-modulow-${tag}@test.stolik`;
    const created = await createStaffAccount(db, { email, displayName: "Admin modułów", isPlatformAdmin: true });
    if (created.status !== "created") throw new Error(created.status);
    accountIds.push(created.id);
    const link = await issueStaffToken(db, created.id, "invite");
    if (link.status !== "issued") throw new Error("link");
    const redeemed = await redeemStaffToken(db, link.token, { password: PASSWORD, repeat: PASSWORD });
    if (redeemed.status !== "ok") throw new Error(redeemed.status);
    const session = await getSession(db, redeemed.session.token);
    if (!session) throw new Error("session");
    return session;
  }

  beforeAll(() => {
    db = localDb();
  });

  afterAll(async () => {
    if (eventIds.length > 0) await db.from("event").delete().in("id", eventIds);
    if (restaurantIds.length > 0) await db.from("restaurant").delete().in("id", restaurantIds);
    if (accountIds.length > 0) await db.from("staff_account").delete().in("id", accountIds);
  });

  it("a new event has AI topics and the guessing game off and paid modules locked; the access carries it", async () => {
    const { event } = await newEvent("domyślne");
    const modules = await getEventModules(db, event.id);
    const active = Object.fromEntries((modules?.modules ?? []).map((module) => [module.key, module.active]));
    expect(active).toEqual({
      questions: true,
      aiTopics: false,
      guessing: false,
      seatingDraw: true,
      tvSpotlight: true,
      pubQuiz: false,
    });
    const organizer = await resolveAccess(db, "organizer", event.organizerKey);
    expect(organizer?.event.modules).toEqual(active);
    const tv = await resolveAccess(db, "tv", event.tvKey);
    expect(tv?.event.modules.tvSpotlight).toBe(true);
  });

  it("the client switches an available free module, never a locked or withdrawn one, and data stays", async () => {
    const { restaurantId, event } = await newEvent("klient");
    const before = (await getQuestionList(db, event.id)).questions.length;
    expect((await setModuleEnabled(db, event.id, "guessing", true)).status).toBe("updated");
    expect((await setModuleEnabled(db, event.id, "aiTopics", true)).status).toBe("locked");
    expect((await setModuleEnabled(db, event.id, "questions", false)).status).toBe("updated");
    expect((await getQuestionList(db, event.id)).questions.length).toBe(before);
    expect((await setModuleAvailable(db, restaurantId, event.id, "questions", false)).status).toBe("updated");
    expect((await setModuleEnabled(db, event.id, "questions", true)).status).toBe("unavailable");
    expect((await setModuleAvailable(db, restaurantId + 1_000_000, event.id, "questions", true)).status).toBe(
      "not-found",
    );
    expect((await setModuleAvailable(db, restaurantId, event.id, "questions", true)).status).toBe("updated");
    const back = await setModuleEnabled(db, event.id, "questions", true);
    expect(back.status === "updated" && back.modules.modules.find((m) => m.key === "questions")?.active).toBe(true);
    expect((await getQuestionList(db, event.id)).questions.length).toBe(before);
  });

  it("the administrator unlocks a paid module only inside a support visit, and the owner's log says so", async () => {
    const { restaurantId, event } = await newEvent("odblokowanie");
    const admin = await adminSession();
    expect(await unlockEventModule(db, admin.sessionId, event.id, "aiTopics", true)).toEqual({ status: "not-found" });
    const entered = await beginSupport(db, admin, restaurantId, "Odblokowanie tematów AI");
    expect(entered.status).toBe("entered");
    const unlocked = await unlockEventModule(db, admin.sessionId, event.id, "aiTopics", true);
    expect(unlocked.status).toBe("changed");
    expect((await unlockEventModule(db, admin.sessionId, event.id, "aiTopics", true)).status).toBe("unchanged");
    expect((await setModuleEnabled(db, event.id, "aiTopics", true)).status).toBe("updated");
    const relocked = await unlockEventModule(db, admin.sessionId, event.id, "aiTopics", false);
    expect(relocked.status === "changed" && relocked.modules.modules.find((m) => m.key === "aiTopics")?.active).toBe(
      false,
    );
    await endSupport(db, admin.sessionId, restaurantId);
    expect((await unlockEventModule(db, admin.sessionId, event.id, "aiTopics", true)).status).toBe("not-found");
    const log = await getSupportLog(db, restaurantId);
    expect(log.entries.map((entry) => entry.kind)).toEqual(["exit", "lock", "unlock", "enter"]);
    expect(log.entries[2]).toMatchObject({ module: "aiTopics", event: { id: event.id } });
  });
});
