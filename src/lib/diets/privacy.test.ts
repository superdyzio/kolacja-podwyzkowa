import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// NFR-021 (guest-import-diets, S-23): guest data — names, diets, notes — never goes to an AI service. The AI modules
// build their prompts from categories, themes and the venue (rooms, tables) only. This guard reads their sources: none
// may import the guest or diet modules, the guest rows, or mention a diet, so a future change cannot slip guest data
// into a prompt without failing here.

const AI_DIRECTORIES = ["src/lib/ai-topics", "src/lib/venue-ai"];

function sources(directory: string): { file: string; text: string }[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => ({ file: join(directory, name), text: readFileSync(join(directory, name), "utf8") }));
}

describe("AI modules never read guest data (NFR-021)", () => {
  const files = AI_DIRECTORIES.flatMap(sources);

  it("finds the AI sources", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(AI_DIRECTORIES.flatMap(sources).map((source) => [source.file, source.text]))(
    "%s imports no guest or diet module and names no diet",
    (_file, text) => {
      // Pure helpers such as @/lib/guests/names (a name's length rule) are fine; the guest list, the import, the
      // diets, the links, the seating and the orders are not.
      expect(text).not.toMatch(
        /@\/lib\/(guests["'/](?!names)|guests\/(service|import)|diets|guest-links|seating\/service|orders)/,
      );
      expect(text).not.toMatch(/from\("guest"\)|display_name|\bdiets\b|dietNote|diet_note|DietTag/);
    },
  );
});
