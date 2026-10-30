// The question draw rule (S-07, PRD FR-015), pure. The server picks; the drawer's browser remembers which questions
// it drew lately (oldest first) and sends them along, so the same person does not get the same question again soon.
// Nothing is stored on the server, so a draw stays visible only to whoever made it.

// What the drawer sees when the draw finds nothing (the category, or the whole base, is empty).
export const EMPTY_CATEGORY_MESSAGE = "W tej kategorii nie ma jeszcze pytań.";
export const EMPTY_BASE_MESSAGE = "Baza pytań jest pusta.";

// How many recently drawn ids a browser keeps and may send (also the zod cap of the draw routes).
export const MAX_RECENT = 100;

// Picks one candidate:
// - candidates not drawn recently → uniform random among them;
// - every candidate drawn recently → random among the OLDER half of them by their position in `recent` (at least
//   one), so the newest one never comes back right away unless it is the only candidate;
// - no candidates → null.
// `recent` is ordered oldest → newest; ids that are not candidates are ignored. `random` returns [0, 1).
export function pickQuestion<T extends { id: number }>(
  candidates: readonly T[],
  recent: readonly number[],
  random: () => number,
): T | null {
  if (candidates.length === 0) {
    return null;
  }
  const position = new Map<number, number>();
  recent.forEach((id, index) => position.set(id, index));

  const fresh = candidates.filter((candidate) => !position.has(candidate.id));
  if (fresh.length > 0) {
    return pickOne(fresh, random);
  }
  const oldestFirst = [...candidates].sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
  return pickOne(oldestFirst.slice(0, Math.max(1, Math.ceil(oldestFirst.length / 2))), random);
}

function pickOne<T>(pool: readonly T[], random: () => number): T | null {
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)));
  return pool[index] ?? null;
}

// The recent list after drawing `id`: `id` moves to the end (newest), the oldest ids drop beyond MAX_RECENT.
export function pushRecent(recent: readonly number[], id: number): number[] {
  return [...recent.filter((other) => other !== id), id].slice(-MAX_RECENT);
}

// Uniform [0, 1) from the platform CSPRNG (Node and browsers both have Web Crypto).
export function secureRandom(): number {
  const [value = 0] = crypto.getRandomValues(new Uint32Array(1));
  return value / 2 ** 32;
}
