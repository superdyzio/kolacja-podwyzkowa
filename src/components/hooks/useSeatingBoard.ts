import { useCallback, useState } from "react";
import { displacedGuest, lostSeatMessage } from "@/lib/seating/board";
import {
  DRAW_INFEASIBLE_MESSAGE,
  createRandom,
  describeDrawProblem,
  drawSeating,
  drawnMessage,
  randomSeed,
} from "@/lib/seating/draw";
import { repeatedNeighbours } from "@/lib/seating/neighbours";
import { PUBLISHED_MESSAGE, PUBLISH_UNCHANGED_MESSAGE } from "@/lib/seating/rules";
import type { NeighbourHistoryDto, SeatingBoardDto } from "@/types";
import { NETWORK_FAILURE, readJson, toFailure, type ApiFailure } from "./api-failure";

// Board state of the seating page. Every change goes through the API, and the board is replaced with the one the
// server returns, so the page never drifts from the database (or from what the TV was last given).
// The draw (S-04) runs here, in the organizer's browser: fresh board + neighbour history in, a draft out, which the
// server re-checks and saves as the working arrangement. Nothing reaches the TV until „Opublikuj na TV”.

export function isBoard(data: unknown): data is SeatingBoardDto {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const candidate = data as Partial<Record<keyof SeatingBoardDto, unknown>>;
  return (
    typeof candidate.guestList === "object" &&
    typeof candidate.venue === "object" &&
    Array.isArray(candidate.assignments) &&
    "published" in candidate &&
    "previous" in candidate &&
    typeof candidate.upToDate === "boolean"
  );
}

function isHistory(data: unknown): data is NeighbourHistoryDto {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const candidate = data as Partial<Record<keyof NeighbourHistoryDto, unknown>>;
  return typeof candidate.snapshotCount === "number" && Array.isArray(candidate.pairs);
}

function pick(board: SeatingBoardDto): SeatingBoardDto {
  return {
    guestList: board.guestList,
    venue: board.venue,
    assignments: board.assignments,
    published: board.published,
    previous: board.previous,
    upToDate: board.upToDate,
  };
}

function noticeOf(data: unknown): string | null {
  if (typeof data === "object" && data !== null && "notice" in data) {
    return typeof data.notice === "string" ? data.notice : null;
  }
  return null;
}

interface Saved {
  board: SeatingBoardDto;
  status: number;
  data: unknown;
}

// "draw": the working arrangement is a draw nobody has touched since (redrawing it loses nothing). Every other
// saved change clears it.
export type BoardOrigin = "draw" | null;

// Lets the browser paint „Losuję…” before the (synchronous, up to ~1 s) search starts.
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

export function useSeatingBoard(apiBase: string, initialBoard: SeatingBoardDto, initialHistory: NeighbourHistoryDto) {
  const [board, setBoard] = useState<SeatingBoardDto>(initialBoard);
  const [history, setHistory] = useState<NeighbourHistoryDto>(initialHistory);
  const [origin, setOrigin] = useState<BoardOrigin>(null);
  const [pending, setPending] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // One request; resolves to the saved board (and the answer), or null when the change failed (failure set).
  const send = useCallback(
    async (method: "PUT" | "PATCH" | "DELETE" | "POST", path: string, body?: unknown): Promise<Saved | null> => {
      try {
        const response = await fetch(`${apiBase}/seating${path}`, {
          method,
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await readJson(response);
        if (response.ok && isBoard(data)) {
          const next = pick(data);
          setBoard(next);
          setOrigin(null);
          return { board: next, status: response.status, data };
        }
        setFailure(toFailure(data));
        // The board may be stale (changed in another tab, a guest or table deleted meanwhile, a table with fewer
        // seats now): reload it so the next try starts from the truth.
        if (response.status === 400 || response.status === 404 || response.status === 409) {
          const fresh = await fetch(`${apiBase}/seating`).then(readJson, () => null);
          if (isBoard(fresh)) {
            setBoard(pick(fresh));
          }
        }
        return null;
      } catch {
        setFailure(NETWORK_FAILURE);
        return null;
      }
    },
    [apiBase],
  );

  const run = useCallback(
    async (method: "PUT" | "PATCH" | "DELETE" | "POST", path: string, body?: unknown): Promise<Saved | null> => {
      setPending(true);
      setFailure(null);
      setNotice(null);
      try {
        return await send(method, path, body);
      } finally {
        setPending(false);
      }
    },
    [send],
  );

  // Seats the guest on (table, seat); names whoever lost their seat because of it. Resolves to true when saved.
  const seat = useCallback(
    async (guestId: number, tableId: number, seatNumber: number): Promise<boolean> => {
      const before = board.assignments;
      const saved = await run("PUT", `/guests/${guestId}`, { tableId, seat: seatNumber });
      if (!saved) {
        return false;
      }
      const lost = displacedGuest(before, saved.board.assignments, { guestId, tableId, seat: seatNumber });
      if (lost !== null) {
        const name = saved.board.guestList.guests.find((guest) => guest.id === lost)?.displayName ?? "?";
        setNotice(lostSeatMessage(name));
      }
      return true;
    },
    [board.assignments, run],
  );

  const unseat = useCallback(async (guestId: number) => (await run("DELETE", `/guests/${guestId}`)) !== null, [run]);

  const setPinned = useCallback(
    async (guestId: number, pinned: boolean) => (await run("PATCH", `/guests/${guestId}`, { pinned })) !== null,
    [run],
  );

  const refreshHistory = useCallback(async () => {
    const data = await fetch(`${apiBase}/seating/history`).then(readJson, () => null);
    if (isHistory(data)) {
      setHistory(data);
    }
  }, [apiBase]);

  const publish = useCallback(async () => {
    const saved = await run("POST", "/publish");
    if (saved) {
      setNotice(saved.status === 201 ? PUBLISHED_MESSAGE : PUBLISH_UNCHANGED_MESSAGE);
      if (saved.status === 201) {
        // The new snapshot joins the history the next draw avoids.
        await refreshHistory();
      }
    }
    return saved !== null;
  }, [run, refreshHistory]);

  // Draws a new arrangement from fresh data and saves it as the working arrangement. An infeasible draw explains
  // why and changes nothing.
  const draw = useCallback(async (): Promise<boolean> => {
    setPending(true);
    setDrawing(true);
    setFailure(null);
    setNotice(null);
    try {
      const [boardResponse, historyResponse] = await Promise.all([
        fetch(`${apiBase}/seating`),
        fetch(`${apiBase}/seating/history`),
      ]);
      const [freshBoard, freshHistory] = await Promise.all([readJson(boardResponse), readJson(historyResponse)]);
      if (!isBoard(freshBoard) || !isHistory(freshHistory)) {
        setFailure(toFailure(isBoard(freshBoard) ? freshHistory : freshBoard));
        return false;
      }
      setBoard(pick(freshBoard));
      setHistory(freshHistory);
      await nextFrame();

      const result = drawSeating(freshBoard, freshHistory.pairs, { random: createRandom(randomSeed()) });
      if (result.status === "infeasible") {
        setFailure({ message: DRAW_INFEASIBLE_MESSAGE, details: result.problems.map(describeDrawProblem) });
        return false;
      }
      const saved = await send("POST", "/draft", { seats: result.seats });
      if (!saved) {
        return false;
      }
      setOrigin("draw");
      setNotice(drawnMessage(repeatedNeighbours(saved.board, freshHistory.pairs).length));
      return true;
    } catch {
      setFailure(NETWORK_FAILURE);
      return false;
    } finally {
      setPending(false);
      setDrawing(false);
    }
  }, [apiBase, send]);

  // Puts a published arrangement back into the working arrangement (not published until the organizer says so).
  const restore = useCallback(
    async (snapshotId: number): Promise<boolean> => {
      const saved = await run("POST", "/restore", { snapshotId });
      if (saved) {
        setNotice(noticeOf(saved.data));
      }
      return saved !== null;
    },
    [run],
  );

  const showNotice = useCallback((message: string) => {
    setNotice(message);
  }, []);

  const dismissFailure = useCallback(() => {
    setFailure(null);
  }, []);

  const dismissNotice = useCallback(() => {
    setNotice(null);
  }, []);

  return {
    board,
    history,
    origin,
    pending,
    drawing,
    failure,
    notice,
    seat,
    unseat,
    setPinned,
    publish,
    draw,
    restore,
    showNotice,
    dismissFailure,
    dismissNotice,
  };
}
