import { describe, expect, it } from "vitest";
import { guest, input, seat, table } from "./fixtures.test-helpers";
import {
  describeWarnings,
  formatNameList,
  formatPublishedAt,
  formatSeatingSummary,
  guestPinnedMessage,
  seatLabel,
  seatOutOfRangeMessage,
  seatPinnedMessage,
  seatingWarnings,
  summarizeSeating,
} from "./rules";

const ania = guest(1, "Ania", { groupId: 10 });
const kuba = guest(2, "Kuba", { groupId: 10 });
const ola = guest(3, "Ola");
const round8 = table(1, "Okno", 8);
const rect8 = table(2, "Kominek", 8, "rectangular");

describe("seatingWarnings — groups", () => {
  const pair = [{ id: 10, memberIds: [1, 2] }];

  it("is quiet when the pair sits next to each other, also across the round-table wrap", () => {
    const data = input([ania, kuba], [round8], [seat(1, 1, 8), seat(2, 1, 1)], pair);
    expect(seatingWarnings(data).groups).toEqual([]);
  });

  it("is quiet while nobody of the group has a seat yet", () => {
    expect(seatingWarnings(input([ania, kuba], [round8], [], pair)).groups).toEqual([]);
  });

  it("flags a pair at different tables", () => {
    const data = input([ania, kuba], [round8, rect8], [seat(1, 1, 1), seat(2, 2, 1)], pair);
    expect(seatingWarnings(data).groups).toEqual([
      { groupId: 10, memberNames: ["Ania", "Kuba"], problem: "different-tables" },
    ]);
  });

  it("flags a pair at one table that is not on consecutive seats (rectangular opposite seats count as apart)", () => {
    const data = input([ania, kuba], [rect8], [seat(1, 2, 1), seat(2, 2, 5)], pair);
    expect(seatingWarnings(data).groups[0]?.problem).toBe("not-adjacent");
  });

  it("flags a group with only some members seated", () => {
    const data = input([ania, kuba], [round8], [seat(1, 1, 1)], pair);
    expect(seatingWarnings(data).groups[0]?.problem).toBe("partly-seated");
  });

  it("ignores absent members and groups with fewer than two present members", () => {
    const absentKuba = { ...kuba, isAbsent: true };
    const trio = [{ id: 10, memberIds: [1, 2, 3] }];
    const olaInGroup = { ...ola, groupId: 10 };
    const data = input([ania, absentKuba, olaInGroup], [round8], [seat(1, 1, 1), seat(3, 1, 2)], trio);
    expect(seatingWarnings(data).groups).toEqual([]);
    const lonely = input([ania, absentKuba], [round8], [seat(1, 1, 1)], pair);
    expect(seatingWarnings(lonely).groups).toEqual([]);
  });
});

describe("seatingWarnings — absences and capacity", () => {
  it("lists absent guests who still have a seat", () => {
    const data = input([ania, { ...ola, isAbsent: true }], [round8], [seat(3, 1, 4)]);
    expect(seatingWarnings(data).absentSeated).toEqual(["Ola"]);
  });

  it("counts missing seats for present guests only", () => {
    const small = table(1, "Mały", 2);
    expect(seatingWarnings(input([ania, kuba, ola], [small], [])).missingSeats).toBe(1);
    expect(seatingWarnings(input([ania, kuba, { ...ola, isAbsent: true }], [small], [])).missingSeats).toBe(0);
  });
});

describe("describeWarnings", () => {
  it("writes one Polish line per warning", () => {
    expect(
      describeWarnings({
        groups: [
          { groupId: 1, memberNames: ["Ania", "Kuba"], problem: "different-tables" },
          { groupId: 2, memberNames: ["Ola", "Ewa", "Jan"], problem: "not-adjacent" },
        ],
        absentSeated: ["Kasia", "Marek"],
        missingSeats: 3,
      }),
    ).toEqual([
      "Ania i Kuba — siedzą przy różnych stolikach.",
      "Ola, Ewa i Jan — siedzą przy jednym stoliku, ale nie obok siebie.",
      "Nieobecni z miejscem (nie pojawią się na TV): Kasia, Marek.",
      "Brakuje 3 miejsc dla obecnych gości.",
    ]);
    expect(describeWarnings({ groups: [], absentSeated: [], missingSeats: 1 })).toEqual([
      "Brakuje 1 miejsca dla obecnych gości.",
    ]);
  });
});

describe("summaries and labels", () => {
  it("counts present, seated, seats and pins", () => {
    const data = input([ania, kuba, { ...ola, isAbsent: true }], [round8, rect8], [seat(1, 1, 1, true), seat(3, 1, 2)]);
    expect(summarizeSeating(data)).toEqual({ present: 2, seatedPresent: 1, seats: 16, pinned: 1 });
  });

  it("formats the summary with the publication status", () => {
    const summary = { present: 38, seatedPresent: 32, seats: 52, pinned: 1 };
    const published = { snapshotId: 3, publishedAt: "2026-10-27T18:42:00.000Z" };
    expect(formatSeatingSummary(summary, published, true)).toBe(
      "32 z 38 obecnych ma miejsce · opublikowano 27.10, 19:42",
    );
    expect(formatSeatingSummary(summary, published, false)).toBe(
      "32 z 38 obecnych ma miejsce · nieopublikowane zmiany",
    );
    expect(formatSeatingSummary(summary, null, false)).toBe("32 z 38 obecnych ma miejsce · jeszcze nie opublikowano");
  });

  it("formats times in Polish time", () => {
    expect(formatPublishedAt("2026-11-08T08:05:00.000Z")).toBe("8.11, 09:05");
  });

  it("builds labels and messages", () => {
    expect(seatLabel("Okno", 2)).toBe("Okno, miejsce 2");
    expect(formatNameList([])).toBe("");
    expect(formatNameList(["Ania"])).toBe("Ania");
    expect(seatOutOfRangeMessage(9)).toBe("Ten stolik nie ma miejsca nr 9.");
    expect(guestPinnedMessage("Ola")).toBe("„Ola” ma przypięte miejsce — najpierw je odepnij.");
    expect(seatPinnedMessage("Ola")).toBe("To miejsce zajmuje przypięta osoba „Ola” — najpierw ją odepnij.");
  });
});
