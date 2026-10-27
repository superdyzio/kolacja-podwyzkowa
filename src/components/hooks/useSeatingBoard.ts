import { useCallback, useState } from "react";
import { displacedGuest, lostSeatMessage } from "@/lib/seating/board";
import { PUBLISHED_MESSAGE, PUBLISH_UNCHANGED_MESSAGE } from "@/lib/seating/rules";
import type { SeatingBoardDto } from "@/types";
import { NETWORK_FAILURE, readJson, toFailure, type ApiFailure } from "./api-failure";

// Board state of the seating page. Every change goes through the API, and the board is replaced with the one the
// server returns, so the page never drifts from the database (or from what the TV was last given).

function isBoard(data: unknown): data is SeatingBoardDto {
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

interface Saved {
  board: SeatingBoardDto;
  status: number;
}

export function useSeatingBoard(apiBase: string, initialBoard: SeatingBoardDto) {
  const [board, setBoard] = useState<SeatingBoardDto>(initialBoard);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Resolves to the saved board (and the answer's status), or null when the change failed.
  const run = useCallback(
    async (method: "PUT" | "PATCH" | "DELETE" | "POST", path: string, body?: unknown): Promise<Saved | null> => {
      setPending(true);
      setFailure(null);
      setNotice(null);
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
          return { board: next, status: response.status };
        }
        setFailure(toFailure(data));
        // The board may be stale (changed in another tab, a guest or table deleted meanwhile): reload it so the
        // next try starts from the truth.
        if (response.status === 404 || response.status === 409) {
          const fresh = await fetch(`${apiBase}/seating`).then(readJson, () => null);
          if (isBoard(fresh)) {
            setBoard(pick(fresh));
          }
        }
        return null;
      } catch {
        setFailure(NETWORK_FAILURE);
        return null;
      } finally {
        setPending(false);
      }
    },
    [apiBase],
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

  const publish = useCallback(async () => {
    const saved = await run("POST", "/publish");
    if (saved) {
      setNotice(saved.status === 201 ? PUBLISHED_MESSAGE : PUBLISH_UNCHANGED_MESSAGE);
    }
    return saved !== null;
  }, [run]);

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
    pending,
    failure,
    notice,
    seat,
    unseat,
    setPinned,
    publish,
    showNotice,
    dismissFailure,
    dismissNotice,
  };
}
