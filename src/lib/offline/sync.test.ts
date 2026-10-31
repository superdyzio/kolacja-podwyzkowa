import { describe, expect, it, vi } from "vitest";
import type { GuessBoardDto, PublishedSeatingDto } from "@/types";
import { readOfflineState, type FetchFunction } from "./sync";

// The offline sync read (S-09) with a fake fetch: both parts answered → ok; the app's denial → gone; anything else
// (network error, abort, server error, a body that is not ours, a foreign 404) → offline.

const API = "/api/o/AAAAAAAAAAAAAAAAAAAAAAAA";

const published: PublishedSeatingDto = {
  snapshotId: 2,
  publishedAt: "2026-11-08T20:05:00.000Z",
  tables: [{ name: "Okno", room: "Sala duża", shape: "round", seatCount: 4, seats: [{ seat: 1, name: "Ania" }] }],
};

const board: GuessBoardDto = {
  intakeOpen: true,
  correctAmountGrosze: null,
  guests: [{ id: 1, displayName: "Ania", isAbsent: false, amountGrosze: 450000, enteredBy: "guest" }],
  missing: [],
  ranking: null,
};

const DENIAL_HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers });
}

function fakeFetch(answers: Partial<Record<string, () => Response | Promise<Response>>>) {
  return vi.fn<FetchFunction>((input) => {
    const path = input.slice(API.length);
    const answer = answers[path];
    return answer ? Promise.resolve(answer()) : Promise.reject(new TypeError("Failed to fetch"));
  });
}

const signal = () => new AbortController().signal;

describe("readOfflineState", () => {
  it("reads both parts without the HTTP cache", async () => {
    const fetchFn = fakeFetch({
      "/seating/published": () => json({ published }),
      "/guesses": () => json(board),
    });
    expect(await readOfflineState(API, fetchFn, signal())).toEqual({ status: "ok", published, board });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchFn.mock.calls) {
      expect(init?.cache).toBe("no-store");
    }
  });

  it("accepts a seating that was never published", async () => {
    const fetchFn = fakeFetch({
      "/seating/published": () => json({ published: null }),
      "/guesses": () => json(board),
    });
    expect(await readOfflineState(API, fetchFn, signal())).toEqual({ status: "ok", published: null, board });
  });

  it("is offline on a network error", async () => {
    const fetchFn = fakeFetch({ "/guesses": () => json(board) });
    expect(await readOfflineState(API, fetchFn, signal())).toEqual({ status: "offline" });
  });

  it("is offline when the read is aborted (too slow)", async () => {
    const controller = new AbortController();
    const fetchFn = vi.fn<FetchFunction>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const read = readOfflineState(API, fetchFn, controller.signal);
    controller.abort();
    expect(await read).toEqual({ status: "offline" });
  });

  it("is offline on a server error", async () => {
    const fetchFn = fakeFetch({
      "/seating/published": () => json({ published }),
      "/guesses": () => json({ error: "Coś poszło nie tak." }, 503),
    });
    expect(await readOfflineState(API, fetchFn, signal())).toEqual({ status: "offline" });
  });

  it("is offline when a body is not ours", async () => {
    const htmlFetch = fakeFetch({
      "/seating/published": () => new Response("<html>Zaloguj się do Wi-Fi</html>", { status: 200 }),
      "/guesses": () => json(board),
    });
    expect(await readOfflineState(API, htmlFetch, signal())).toEqual({ status: "offline" });

    const badBoard = fakeFetch({
      "/seating/published": () => json({ published }),
      "/guesses": () => json({ ...board, guests: "nope" }),
    });
    expect(await readOfflineState(API, badBoard, signal())).toEqual({ status: "offline" });

    const badSeating = fakeFetch({
      "/seating/published": () => json({ published: { ...published, snapshotId: "x" } }),
      "/guesses": () => json(board),
    });
    expect(await readOfflineState(API, badSeating, signal())).toEqual({ status: "offline" });
  });

  it("is gone when the app denies the organizer key", async () => {
    const fetchFn = fakeFetch({
      "/seating/published": () => json({ error: "Brak dostępu" }, 404, DENIAL_HEADERS),
      "/guesses": () => json({ error: "Brak dostępu" }, 404, DENIAL_HEADERS),
    });
    expect(await readOfflineState(API, fetchFn, signal())).toEqual({ status: "gone" });
  });

  it("is offline on a 404 that did not come from the app", async () => {
    const fetchFn = fakeFetch({
      "/seating/published": () => new Response("Not found", { status: 404 }),
      "/guesses": () => new Response("Not found", { status: 404 }),
    });
    expect(await readOfflineState(API, fetchFn, signal())).toEqual({ status: "offline" });
  });
});
