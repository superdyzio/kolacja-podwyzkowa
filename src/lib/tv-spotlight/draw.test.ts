import { describe, expect, it } from "vitest";
import { createRandom } from "@/lib/seating/draw";
import { pickPerson, ROULETTE_STEPS, rouletteSteps } from "./draw";

// A source that returns the given values in turn (then repeats the last one).
function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}

describe("pickPerson", () => {
  it("picks uniformly by the random source", () => {
    const names = ["Ania", "Kuba", "Ola"];
    expect(pickPerson(names, null, sequence(0))).toBe("Ania");
    expect(pickPerson(names, null, sequence(0.5))).toBe("Kuba");
    expect(pickPerson(names, null, sequence(0.999))).toBe("Ola");
    // A source returning 1 (it should not) still gives a valid name.
    expect(pickPerson(names, null, sequence(1))).toBe("Ola");
  });

  it("never draws the person on the TV right now, unless they are the only one", () => {
    const random = createRandom(42);
    for (let draw = 0; draw < 200; draw++) {
      expect(pickPerson(["Ania", "Ola"], "Ola", random)).toBe("Ania");
    }
    expect(pickPerson(["Ola"], "Ola", random)).toBe("Ola");
  });

  it("gives nobody when nobody is present", () => {
    expect(pickPerson([], null, sequence(0.3))).toBeNull();
    expect(pickPerson([], "Ola", sequence(0.3))).toBeNull();
  });
});

describe("rouletteSteps", () => {
  const pool = ["Ania", "Kuba", "Ola", "Zosia", "Kuba"];

  it("spins through the others, never the winner and never the same name twice in a row", () => {
    const steps = rouletteSteps(pool, "Ola", createRandom(7));
    expect(steps).toHaveLength(ROULETTE_STEPS);
    expect(steps.every((step) => ["Ania", "Kuba", "Zosia"].includes(step.name))).toBe(true);
    for (let index = 1; index < steps.length; index++) {
      expect(steps[index]?.name).not.toBe(steps[index - 1]?.name);
    }
  });

  it("slows down and lasts a few seconds", () => {
    const steps = rouletteSteps(pool, "Ola", createRandom(7));
    const times = steps.map((step) => step.ms);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    const total = times.reduce((sum, ms) => sum + ms, 0);
    expect(total).toBeGreaterThan(3_500);
    expect(total).toBeLessThan(6_000);
  });

  it("alternates when only one other name exists, and is empty when there is nobody else", () => {
    expect(new Set(rouletteSteps(["Ola", "Ania"], "Ola", createRandom(1)).map((step) => step.name))).toEqual(
      new Set(["Ania"]),
    );
    expect(rouletteSteps(["Ola", "Ola"], "Ola", createRandom(1))).toEqual([]);
    expect(rouletteSteps([], "Ola", createRandom(1))).toEqual([]);
  });
});
