// Drawing a guest for the TV (tv-spotlight), pure; the random source is injected (the server passes secureRandom,
// tests a fixed sequence).

// A uniform index in [0, length) from a [0, 1) source (clamped, should the source ever return 1).
function pickIndex(length: number, random: () => number): number {
  return Math.min(length - 1, Math.floor(random() * length));
}

// One present guest's name, uniformly; never the name that is on the TV right now unless they are the only one.
// null when nobody is present.
export function pickPerson(names: readonly string[], current: string | null, random: () => number): string | null {
  const candidates = names.length > 1 ? names.filter((name) => name !== current) : names;
  const pool = candidates.length > 0 ? candidates : names;
  if (pool.length === 0) {
    return null;
  }
  return pool[pickIndex(pool.length, random)];
}

export interface RouletteStep {
  name: string;
  // How long this name stays before the next one.
  ms: number;
}

export const ROULETTE_STEPS = 26;
const FIRST_STEP_MS = 70;
const LAST_STEP_MS = 420;

// The TV's "who will it be" spin before revealing `winner`: names from `pool` (the TV's own seated names), never the
// same twice in a row and never the winner, slowing down (ease-out) for about four seconds. The reveal itself is not a
// step. Empty when the pool has nobody else, so the TV just shows the winner.
export function rouletteSteps(pool: readonly string[], winner: string, random: () => number): RouletteStep[] {
  const others = [...new Set(pool)].filter((name) => name !== winner);
  if (others.length === 0) {
    return [];
  }
  const steps: RouletteStep[] = [];
  let previous: string | null = null;
  for (let index = 0; index < ROULETTE_STEPS; index++) {
    const choices = others.length > 1 ? others.filter((name) => name !== previous) : others;
    const name = choices[pickIndex(choices.length, random)];
    const progress = index / (ROULETTE_STEPS - 1);
    steps.push({ name, ms: Math.round(FIRST_STEP_MS + (LAST_STEP_MS - FIRST_STEP_MS) * progress * progress) });
    previous = name;
  }
  return steps;
}
