import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GuestStateDto } from "@/types";
import { guestStateStore } from "./guest-state-store";

// The shared guest poll (S-06) in Node with fake timers and a stubbed fetch/document: one request chain however many
// islands subscribe, pushed states win over older polls, 404 clears the state, and only a seat change raises
// "Nowe miejsce!".

function state(overrides: Partial<GuestStateDto> = {}): GuestStateDto {
  return {
    version: "v1",
    name: "Ania",
    status: "seated",
    seat: { table: "Okno", room: "Sala", seat: 1, shape: "round", seatCount: 6, x: 0.5, y: 0.5 },
    planVersion: null,
    guess: { intakeOpen: true, amountGrosze: null },
    ...overrides,
  };
}

let apiCounter = 0;
let fetchMock: ReturnType<typeof vi.fn>;

function answer(status: number, body?: unknown): Response {
  return body === undefined ? new Response(null, { status }) : Response.json(body, { status });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("document", { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  fetchMock = vi.fn(() => Promise.resolve(answer(204)));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function freshStore(initial = state()) {
  apiCounter++;
  return guestStateStore(`/api/g/test-${apiCounter}`, initial);
}

describe("guest state store", () => {
  it("polls once per interval however many islands subscribe, and stops with the last one", async () => {
    const store = freshStore();
    const stopSeat = store.subscribe(() => undefined);
    const stopGuess = store.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(2_500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/state\?since=v1$/);

    stopSeat();
    await vi.advanceTimersByTimeAsync(2_500);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    stopGuess();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns the same store for the same API base", () => {
    const store = freshStore();
    expect(guestStateStore(`/api/g/test-${apiCounter}`, state({ version: "other" }))).toBe(store);
  });

  it("replaces the state on 200 and flags a new seat, but not a guess change", async () => {
    const store = freshStore();
    const listener = vi.fn();
    store.subscribe(listener);

    fetchMock.mockResolvedValueOnce(answer(200, state({ version: "v2", guess: { intakeOpen: false, amountGrosze: 5 } })));
    await vi.advanceTimersByTimeAsync(2_500);
    expect(store.getSnapshot().state?.guess).toEqual({ intakeOpen: false, amountGrosze: 5 });
    expect(store.getSnapshot().seatChanged).toBe(false);
    expect(listener).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/since=v1$/);

    const moved = state({ version: "v3", seat: { ...state().seat!, seat: 4 } });
    fetchMock.mockResolvedValueOnce(answer(200, moved));
    await vi.advanceTimersByTimeAsync(2_500);
    expect(String(fetchMock.mock.calls[1]?.[0])).toMatch(/since=v2$/);
    expect(store.getSnapshot().seatChanged).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(store.getSnapshot().seatChanged).toBe(false);
  });

  it("takes a pushed state at once and ignores an older poll answer that was already on its way", async () => {
    const store = freshStore();
    store.subscribe(() => undefined);
    let release: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    await vi.advanceTimersByTimeAsync(2_500);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    store.push(state({ version: "saved", guess: { intakeOpen: true, amountGrosze: 149_999 } }));
    release(answer(200, state({ version: "stale" })));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot().state?.version).toBe("saved");
    expect(store.getSnapshot().state?.guess.amountGrosze).toBe(149_999);

    await vi.advanceTimersByTimeAsync(2_500);
    expect(String(fetchMock.mock.calls[1]?.[0])).toMatch(/since=saved$/);
  });

  it("clears the state on 404 and keeps polling; goes offline after 3 failures", async () => {
    const store = freshStore();
    store.subscribe(() => undefined);
    fetchMock.mockResolvedValueOnce(answer(404, { error: "Brak dostępu" }));
    await vi.advanceTimersByTimeAsync(2_500);
    expect(store.getSnapshot().state).toBeNull();
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toMatch(/since=v1$/);
    await vi.advanceTimersByTimeAsync(2_500);
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toMatch(/since=$/);

    fetchMock.mockRejectedValue(new Error("network"));
    await vi.advanceTimersByTimeAsync(2_500 * 2);
    expect(store.getSnapshot().offline).toBe(false);
    await vi.advanceTimersByTimeAsync(2_500);
    expect(store.getSnapshot().offline).toBe(true);
    fetchMock.mockResolvedValue(answer(200, state({ version: "back" })));
    await vi.advanceTimersByTimeAsync(2_500);
    expect(store.getSnapshot()).toMatchObject({ offline: false, seatChanged: false });
    expect(store.getSnapshot().state?.version).toBe("back");
  });

  it("refresh() polls now instead of waiting", async () => {
    const store = freshStore();
    store.subscribe(() => undefined);
    store.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
