// Event modules (event-modules, S-17; PRD v2 FR-031, US-07, NFR-023). Games and extras are optional per event. Three
// sets on the event row: what the venue offers (`available`, owner and manager), what the client switched on among
// them (`enabled`), and which paid modules the platform administrator unlocked by hand (`unlocked`). A module works
// when it is available AND enabled AND (free OR unlocked). An off module disappears for the client, the guests and the
// TV and its routes refuse (organizer 409 `module-off`, guest the identical 404); its data stays. Pure.

export const MODULE_KEYS = ["questions", "aiTopics", "guessing", "seatingDraw", "tvSpotlight", "pubQuiz"] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

// Paid modules: locked until the platform administrator unlocks them for the event (no price list yet — Open
// Question 5). AI topics are the one module with a cost per call; pub quiz (S-28) is the paid extra of the PRD.
export const PAID_MODULES: readonly ModuleKey[] = ["aiTopics", "pubQuiz"];

// Defaults of a NEW event (the DB column defaults mirror these): everything offered, AI topics and the guessing game
// off (NFR-023), nothing unlocked. Events from before S-17 got the five v1 modules on and AI topics unlocked.
export const DEFAULT_AVAILABLE: readonly ModuleKey[] = MODULE_KEYS;
export const DEFAULT_ENABLED: readonly ModuleKey[] = ["questions", "seatingDraw", "tvSpotlight"];
export const DEFAULT_UNLOCKED: readonly ModuleKey[] = [];

// The `code` of the refusals, so islands, the offline sync and the smoke can tell them apart.
export const MODULE_CODES = {
  off: "module-off",
  unavailable: "module-unavailable",
  locked: "module-locked",
} as const;

export type EventModules = Readonly<Record<ModuleKey, boolean>>;

export interface ModuleSets {
  available: readonly string[];
  enabled: readonly string[];
  unlocked: readonly string[];
}

export const ALL_MODULES_ON: EventModules = {
  questions: true,
  aiTopics: true,
  guessing: true,
  seatingDraw: true,
  tvSpotlight: true,
  pubQuiz: true,
};

export function isModuleKey(value: unknown): value is ModuleKey {
  return typeof value === "string" && (MODULE_KEYS as readonly string[]).includes(value);
}

export function isPaidModule(key: ModuleKey): boolean {
  return PAID_MODULES.includes(key);
}

export function isModuleActive(sets: ModuleSets, key: ModuleKey): boolean {
  return (
    sets.available.includes(key) && sets.enabled.includes(key) && (!isPaidModule(key) || sets.unlocked.includes(key))
  );
}

export function effectiveModules(sets: ModuleSets): EventModules {
  return Object.fromEntries(MODULE_KEYS.map((key) => [key, isModuleActive(sets, key)])) as Record<ModuleKey, boolean>;
}

// Why the client may not switch a module on (null = it may). Switching off is always allowed.
export function enableProblem(sets: ModuleSets, key: ModuleKey): "unavailable" | "locked" | null {
  if (!sets.available.includes(key)) {
    return "unavailable";
  }
  if (isPaidModule(key) && !sets.unlocked.includes(key)) {
    return "locked";
  }
  return null;
}

// Adds or removes one key, keeping the canonical order (stable arrays → stable rows).
export function withModule(set: readonly string[], key: ModuleKey, on: boolean): ModuleKey[] {
  const next = new Set(set.filter(isModuleKey));
  if (on) {
    next.add(key);
  } else {
    next.delete(key);
  }
  return MODULE_KEYS.filter((candidate) => next.has(candidate));
}

// The module behind an API sub-path (after /api/o/<key>/ or /api/g/<key>/), or null when the route belongs to none.
// Organizer: the question base and draw, AI topics, the guess board, the draw's draft (the history stays readable:
// the seating editor reads it on mount) and the TV screen. Guest: the question draw, AI topics, the own guess.
export function moduleForApiPath(role: "organizer" | "guest", subPath: string): ModuleKey | null {
  const first = subPath.split("/").filter((segment) => segment.length > 0);
  const [head, second] = first;
  if (role === "organizer") {
    switch (head) {
      case "questions":
        return "questions";
      case "ai-topics":
        return "aiTopics";
      case "guesses":
        return "guessing";
      case "tv-spotlight":
        return "tvSpotlight";
      case "seating":
        return second === "draft" ? "seatingDraw" : null;
      default:
        return null;
    }
  }
  switch (head) {
    case "questions":
      return second === "draw" ? "questions" : null;
    case "ai-topics":
      return "aiTopics";
    case "guess":
      return "guessing";
    default:
      return null;
  }
}

// The sub-path of a keyed API path: "/api/o/<key>/guesses/3" → "guesses/3"; null for anything else.
export function keyedApiSubPath(pathname: string): { role: "organizer" | "guest"; subPath: string } | null {
  const match = /^\/api\/(o|g)\/[^/]+\/(.*)$/.exec(pathname);
  if (!match) {
    return null;
  }
  return { role: match[1] === "o" ? "organizer" : "guest", subPath: match[2] };
}

// The guest token part of the modules a phone shows (questions, AI topics, the guess): one character each.
export function guestModulesKey(modules: GuestModules): string {
  return `${modules.questions ? "q" : "-"}${modules.aiTopics ? "a" : "-"}${modules.guessing ? "g" : "-"}`;
}

export interface GuestModules {
  questions: boolean;
  aiTopics: boolean;
  guessing: boolean;
}

export const ALL_GUEST_MODULES: GuestModules = { questions: true, aiTopics: true, guessing: true };

export function guestModulesOf(modules: EventModules): GuestModules {
  return { questions: modules.questions, aiTopics: modules.aiTopics, guessing: modules.guessing };
}
