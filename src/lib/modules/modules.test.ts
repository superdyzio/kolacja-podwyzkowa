import { describe, expect, it } from "vitest";
import { guestStateVersion } from "@/lib/guest-links/state";
import { describeSupportEntry } from "@/lib/support/format";
import { modulesMessages } from "./messages";
import {
  ALL_GUEST_MODULES,
  ALL_MODULES_ON,
  DEFAULT_AVAILABLE,
  DEFAULT_ENABLED,
  DEFAULT_UNLOCKED,
  effectiveModules,
  enableProblem,
  guestModulesKey,
  isPaidModule,
  keyedApiSubPath,
  MODULE_KEYS,
  moduleForApiPath,
  withModule,
} from "./rules";
import { toEventModulesDto } from "./service";

const DEFAULTS = { available: DEFAULT_AVAILABLE, enabled: DEFAULT_ENABLED, unlocked: DEFAULT_UNLOCKED };
const V1 = {
  available: MODULE_KEYS,
  enabled: ["questions", "aiTopics", "guessing", "seatingDraw", "tvSpotlight"],
  unlocked: ["aiTopics"],
};

describe("event modules", () => {
  it("new events: AI topics and the guessing game off, paid modules locked, the rest on", () => {
    expect(effectiveModules(DEFAULTS)).toEqual({
      questions: true,
      aiTopics: false,
      guessing: false,
      seatingDraw: true,
      tvSpotlight: true,
      pubQuiz: false,
    });
    expect(enableProblem(DEFAULTS, "guessing")).toBeNull();
    expect(enableProblem(DEFAULTS, "aiTopics")).toBe("locked");
    expect(enableProblem(DEFAULTS, "pubQuiz")).toBe("locked");
  });

  it("events from before S-17 keep every v1 module on (pub quiz off)", () => {
    expect(effectiveModules(V1)).toEqual({ ...ALL_MODULES_ON, pubQuiz: false });
  });

  it("a module works only when available, enabled and (free or unlocked)", () => {
    const withdrawn = { ...V1, available: withModule(V1.available, "questions", false) };
    expect(effectiveModules(withdrawn).questions).toBe(false);
    expect(enableProblem(withdrawn, "questions")).toBe("unavailable");
    const relocked = { ...V1, unlocked: [] };
    expect(effectiveModules(relocked).aiTopics).toBe(false);
    expect(effectiveModules(relocked).guessing).toBe(true);
    expect(isPaidModule("aiTopics")).toBe(true);
    expect(isPaidModule("guessing")).toBe(false);
  });

  it("withModule keeps the canonical order and drops unknown keys", () => {
    expect(withModule(["tvSpotlight", "questions", "bogus"], "aiTopics", true)).toEqual([
      "questions",
      "aiTopics",
      "tvSpotlight",
    ]);
    expect(withModule(["questions"], "questions", false)).toEqual([]);
  });

  it("maps the gated API paths to their modules and leaves the rest alone", () => {
    expect(moduleForApiPath("organizer", "questions")).toBe("questions");
    expect(moduleForApiPath("organizer", "questions/12")).toBe("questions");
    expect(moduleForApiPath("organizer", "questions/draw")).toBe("questions");
    expect(moduleForApiPath("organizer", "ai-topics")).toBe("aiTopics");
    expect(moduleForApiPath("organizer", "guesses/4")).toBe("guessing");
    expect(moduleForApiPath("organizer", "tv-spotlight/person")).toBe("tvSpotlight");
    expect(moduleForApiPath("organizer", "seating/draft")).toBe("seatingDraw");
    expect(moduleForApiPath("organizer", "seating/history")).toBeNull();
    expect(moduleForApiPath("organizer", "seating")).toBeNull();
    expect(moduleForApiPath("organizer", "modules")).toBeNull();
    expect(moduleForApiPath("organizer", "guests")).toBeNull();
    expect(moduleForApiPath("guest", "guess")).toBe("guessing");
    expect(moduleForApiPath("guest", "questions/draw")).toBe("questions");
    expect(moduleForApiPath("guest", "ai-topics")).toBe("aiTopics");
    expect(moduleForApiPath("guest", "state")).toBeNull();
    expect(moduleForApiPath("guest", "orders")).toBeNull();
    expect(keyedApiSubPath("/api/o/KEY/guesses/3")).toEqual({ role: "organizer", subPath: "guesses/3" });
    expect(keyedApiSubPath("/api/g/KEY/guess")).toEqual({ role: "guest", subPath: "guess" });
    expect(keyedApiSubPath("/api/tv/KEY/seating")).toBeNull();
    expect(keyedApiSubPath("/o/KEY/strzaly")).toBeNull();
  });

  it("the DTO lists every module with its layers", () => {
    const dto = toEventModulesDto(DEFAULTS);
    expect(dto.modules.map((module) => module.key)).toEqual([...MODULE_KEYS]);
    expect(dto.modules.find((module) => module.key === "aiTopics")).toEqual({
      key: "aiTopics",
      available: true,
      enabled: false,
      paid: true,
      unlocked: false,
      active: false,
    });
  });

  it("the guest token changes with the phone's modules and only with them", () => {
    const guess = { intakeOpen: true, amountGrosze: null, predictedPlace: null, maxPlace: 40 };
    const on = guestStateVersion("4.17", "Ania", guess, [], ALL_GUEST_MODULES);
    expect(guestStateVersion("4.17", "Ania", guess, [])).toBe(on);
    expect(guestStateVersion("4.17", "Ania", guess, [], { ...ALL_GUEST_MODULES, guessing: false })).not.toBe(on);
    expect(guestStateVersion("4.17", "Ania", guess, [], { ...ALL_GUEST_MODULES, questions: false })).not.toBe(on);
    expect(guestStateVersion("4.17", "Ania", guess, [], { ...ALL_GUEST_MODULES, aiTopics: false })).not.toBe(on);
    expect(guestStateVersion("4.17", "Ania", guess, [], { ...ALL_GUEST_MODULES, pubQuiz: false })).not.toBe(on);
    // The flags live in the hashed part: no new token part.
    expect(on.split(".")).toHaveLength(
      guestStateVersion("4.17", "Ania", guess, [], { ...ALL_GUEST_MODULES, aiTopics: false }).split(".").length,
    );
  });

  it("adds the pub quiz's flag to the phone's module key only while it is on", () => {
    expect(guestModulesKey({ ...ALL_GUEST_MODULES, pubQuiz: false })).toBe("qag");
    expect(guestModulesKey(ALL_GUEST_MODULES)).toBe("qagp");
    expect(moduleForApiPath("organizer", "quiz")).toBe("pubQuiz");
    expect(moduleForApiPath("organizer", "quiz/questions/3")).toBe("pubQuiz");
    expect(moduleForApiPath("organizer", "quiz/run")).toBe("pubQuiz");
    expect(moduleForApiPath("guest", "quiz")).toBe("pubQuiz");
  });

  it("names every module in both languages and describes the administrator's unlock for the owner", () => {
    for (const key of MODULE_KEYS) {
      expect(modulesMessages("pl").names[key].length).toBeGreaterThan(0);
      expect(modulesMessages("en").names[key].length).toBeGreaterThan(0);
    }
    const entry = {
      id: 1,
      kind: "unlock" as const,
      at: "2026-11-10T04:00:00Z",
      admin: { email: "admin@demo.stolik", name: null },
      reason: null,
      expiresAt: null,
      method: null,
      path: null,
      event: { id: 7, name: "Wigilia" },
      module: "aiTopics" as const,
      link: null,
    };
    expect(describeSupportEntry(entry)).toBe("Odblokowanie modułu płatnego „Tematy AI” w wydarzeniu „Wigilia”");
    expect(describeSupportEntry({ ...entry, kind: "lock" }, "en")).toBe(
      "Locked the paid module “AI topics” again for the event “Wigilia”",
    );
  });
});
