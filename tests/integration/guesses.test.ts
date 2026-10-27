import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getGuestState, getGuestStateVersion } from "@/lib/guest-links";
import {
  deleteGuess,
  getGuessBoard,
  getGuestGuess,
  saveGuessByOrganizer,
  setCorrectAmount,
  setGuessIntakeOpen,
  submitGuestGuess,
} from "@/lib/guesses";
import type { DbClient } from "@/lib/supabase-client";
import type { GuessBoardDto } from "@/types";
import {
  acquireTestEvent,
  createTestGuests,
  deleteTestGuests,
  hasLocalDb,
  localDb,
  readGuessSettings,
  releaseEvent,
  testTag,
  writeGuessSettings,
  type GuessSettings,
  type TestEvent,
} from "./helpers";

const UNKNOWN_ID = 999_999_999_999;

// Guess services (S-06) against the local DB. The board covers the whole event, so assertions look only at the
// test's own guests; the intake switch and the correct amount are put back after every test, and only the test's own
// guests (and with them their guesses) are deleted.
describe.skipIf(!hasLocalDb)("guess services", () => {
  let db: DbClient;
  let event: TestEvent;
  let original: GuessSettings;
  const guestIds: number[] = [];

  beforeAll(async () => {
    db = localDb();
    event = await acquireTestEvent(db);
    original = await readGuessSettings(db);
  });

  afterEach(async () => {
    await writeGuessSettings(db, original);
    await deleteTestGuests(db, guestIds.splice(0));
  });

  afterAll(async () => {
    await releaseEvent(db, event);
  });

  async function guests(count: number) {
    const created = await createTestGuests(db, testTag(), count);
    guestIds.push(...created.ids);
    return created;
  }

  function row(board: GuessBoardDto, id: number) {
    return board.guests.find((guest) => guest.id === id);
  }

  function isMissing(board: GuessBoardDto, id: number) {
    return board.missing.some((guest) => guest.id === id);
  }

  it("saves the guest's own guess while intake is open and shows it on the board", async () => {
    const { ids } = await guests(2);
    const [g1 = 0, g2 = 0] = ids;
    await setGuessIntakeOpen(db, true);
    expect(await submitGuestGuess(db, g1, 149_999)).toEqual({ status: "saved" });
    const board = await getGuessBoard(db);
    expect(board.intakeOpen).toBe(true);
    expect(row(board, g1)).toMatchObject({ amountGrosze: 149_999, enteredBy: "guest" });
    expect(isMissing(board, g1)).toBe(false);
    expect(row(board, g2)).toMatchObject({ amountGrosze: null, enteredBy: null });
    expect(isMissing(board, g2)).toBe(true);

    expect(await submitGuestGuess(db, g1, 150_000)).toEqual({ status: "saved" });
    expect(row(await getGuessBoard(db), g1)?.amountGrosze).toBe(150_000);
  });

  it("refuses the guest's save once intake is closed, but the organizer can still enter and correct", async () => {
    const { ids } = await guests(2);
    const [g1 = 0, g2 = 0] = ids;
    await setGuessIntakeOpen(db, true);
    await submitGuestGuess(db, g1, 100_000);
    await setGuessIntakeOpen(db, false);

    expect(await submitGuestGuess(db, g1, 200_000)).toEqual({ status: "closed" });
    expect(await submitGuestGuess(db, g2, 200_000)).toEqual({ status: "closed" });
    let board = await getGuessBoard(db);
    expect(board.intakeOpen).toBe(false);
    expect(row(board, g1)).toMatchObject({ amountGrosze: 100_000, enteredBy: "guest" });
    expect(isMissing(board, g2)).toBe(true);

    expect(await saveGuessByOrganizer(db, g1, 123_456)).toEqual({ status: "saved" });
    expect(await saveGuessByOrganizer(db, g2, 7)).toEqual({ status: "saved" });
    board = await getGuessBoard(db);
    expect(row(board, g1)).toMatchObject({ amountGrosze: 123_456, enteredBy: "organizer" });
    expect(row(board, g2)).toMatchObject({ amountGrosze: 7, enteredBy: "organizer" });

    await setGuessIntakeOpen(db, true);
    expect(await submitGuestGuess(db, g2, 8)).toEqual({ status: "saved" });
    expect(row(await getGuessBoard(db), g2)).toMatchObject({ amountGrosze: 8, enteredBy: "guest" });
  });

  it("deletes a guess (the guest is missing again) and reports unknown guests", async () => {
    const { ids } = await guests(1);
    const [g1 = 0] = ids;
    await saveGuessByOrganizer(db, g1, 500);
    expect(await deleteGuess(db, g1)).toEqual({ status: "deleted" });
    expect(isMissing(await getGuessBoard(db), g1)).toBe(true);
    expect(await deleteGuess(db, g1)).toEqual({ status: "deleted" });

    expect(await deleteGuess(db, UNKNOWN_ID)).toEqual({ status: "not-found" });
    expect(await saveGuessByOrganizer(db, UNKNOWN_ID, 1)).toEqual({ status: "not-found" });
    await setGuessIntakeOpen(db, true);
    expect(await submitGuestGuess(db, UNKNOWN_ID, 1)).toEqual({ status: "not-found" });
  });

  it("ranks by distance to the grosz once the correct amount is set, ties sharing a place", async () => {
    const { ids, names } = await guests(4);
    const [g1 = 0, g2 = 0, g3 = 0, g4 = 0] = ids;
    await saveGuessByOrganizer(db, g1, 499_999); // 1 grosz too low
    await saveGuessByOrganizer(db, g2, 500_001); // 1 grosz too high → tie with g1
    await saveGuessByOrganizer(db, g3, 500_002); // 2 grosze
    // g4 has no guess

    await setCorrectAmount(db, null);
    expect((await getGuessBoard(db)).ranking).toBeNull();

    await setCorrectAmount(db, 500_000);
    const board = await getGuessBoard(db);
    expect(board.correctAmountGrosze).toBe(500_000);
    const mine = (board.ranking?.entries ?? []).filter((entry) => ids.includes(entry.guestId));
    expect(mine.map((entry) => [entry.guestId, entry.differenceGrosze, entry.distanceGrosze, entry.tied])).toEqual([
      [g1, -1, 1, true],
      [g2, 1, 1, true],
      [g3, 2, 2, false],
    ]);
    expect(mine.map((entry) => entry.place - (mine[0]?.place ?? 0))).toEqual([0, 0, 2]);
    expect(mine[0]?.displayName).toBe(names[0]);
    expect(mine.some((entry) => entry.guestId === g4)).toBe(false);
    expect(isMissing(board, g4)).toBe(true);
  });

  it("lists an absent guest without a guess as missing (marked) and ranks an absent guest's guess", async () => {
    const { ids } = await guests(2);
    const [g1 = 0, g2 = 0] = ids;
    const { error } = await db.from("guest").update({ is_absent: true }).in("id", ids);
    expect(error).toBeNull();
    await saveGuessByOrganizer(db, g2, 1_000);
    await setCorrectAmount(db, 1_000);
    const board = await getGuessBoard(db);
    expect(board.missing.find((guest) => guest.id === g1)).toMatchObject({ isAbsent: true });
    expect(board.ranking?.entries.find((entry) => entry.guestId === g2)).toMatchObject({
      isAbsent: true,
      distanceGrosze: 0,
    });
  });

  it("gives the guest's phone only the intake flag and the own guess, in the live state and its token", async () => {
    const { ids, names } = await guests(2);
    const [g1 = 0, g2 = 0] = ids;
    const me = { id: g1, displayName: names[0] ?? "" };
    const other = { id: g2, displayName: names[1] ?? "" };
    await setGuessIntakeOpen(db, true);
    await setCorrectAmount(db, 424_242);

    expect(await getGuestGuess(db, g1)).toEqual({ intakeOpen: true, amountGrosze: null });
    const before = await getGuestState(db, me);
    expect(before.guess).toEqual({ intakeOpen: true, amountGrosze: null });
    expect(await getGuestStateVersion(db, me)).toBe(before.version);

    await submitGuestGuess(db, g1, 777_777);
    const afterSave = await getGuestState(db, me);
    expect(afterSave.guess).toEqual({ intakeOpen: true, amountGrosze: 777_777 });
    expect(afterSave.version).not.toBe(before.version);
    expect(await getGuestStateVersion(db, me)).toBe(afterSave.version);

    // Another guest's guess changes nothing for me; my guess never shows up in theirs.
    const otherBefore = await getGuestStateVersion(db, other);
    await saveGuessByOrganizer(db, g2, 111_111);
    expect(await getGuestStateVersion(db, me)).toBe(afterSave.version);
    expect(await getGuestStateVersion(db, other)).not.toBe(otherBefore);
    const otherState = JSON.stringify(await getGuestState(db, other));
    expect(otherState).not.toContain("777777");
    expect(otherState).not.toContain("424242");
    expect(JSON.stringify(afterSave)).not.toContain("111111");
    expect(JSON.stringify(afterSave)).not.toContain("424242");

    // An organizer's proxy correction reaches my phone.
    await saveGuessByOrganizer(db, g1, 777_778);
    const afterProxy = await getGuestState(db, me);
    expect(afterProxy.guess.amountGrosze).toBe(777_778);
    expect(afterProxy.version).not.toBe(afterSave.version);

    // So does closing intake.
    await setGuessIntakeOpen(db, false);
    const afterClose = await getGuestState(db, me);
    expect(afterClose.guess).toEqual({ intakeOpen: false, amountGrosze: 777_778 });
    expect(afterClose.version).not.toBe(afterProxy.version);
    expect(await getGuestStateVersion(db, me)).toBe(afterClose.version);
  });
});
