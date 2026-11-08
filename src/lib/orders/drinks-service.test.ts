import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "@/lib/supabase-client";
import { getDrinkItems } from "./drinks-service";

// A client whose every query answers with the given error (getDrinkItems: from → select → eq → order).
function failingDb(error: { code: string; message: string }): DbClient {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => Promise.resolve({ data: null, error }),
  };
  return { from: () => query } as unknown as DbClient;
}

describe("getDrinkItems (bill-drinks)", () => {
  it("answers no drinks while the table is missing (code deployed before its migration)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const code of ["PGRST205", "42P01"]) {
      expect(await getDrinkItems(failingDb({ code, message: "missing" }))).toEqual([]);
    }
    expect(log).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });

  it("throws on any other error", async () => {
    await expect(getDrinkItems(failingDb({ code: "57014", message: "timeout" }))).rejects.toThrow(
      "Nie udało się odczytać napojów: timeout",
    );
  });
});
