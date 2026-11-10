import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { QuizBoardDto } from "@/types";
import { networkFailure, readJson, toFailure, type ApiFailure } from "./api-failure";

// State of the client's pub quiz page (pub-quiz, S-28), also the panel's preview. Every change goes through the API
// and the whole board is replaced with the one the server returns; one change at a time. Guests answer from their
// phones meanwhile, so the board is re-read every 4 s while the page is visible and nothing is being saved (a
// setTimeout chain, one request at a time, 8 s limit); a read that started before a change is ignored.

const POLL_MS = 4_000;
const TIMEOUT_MS = 8_000;

export interface QuizBoardRequest {
  method: "POST" | "PATCH" | "DELETE";
  // Relative to the API base, e.g. "/quiz/run" or "/quiz/questions/12".
  path: string;
  body?: unknown;
}

export function isQuizBoard(data: unknown): data is QuizBoardDto {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const candidate = data as Partial<Record<keyof QuizBoardDto, unknown>>;
  return (
    "run" in candidate &&
    Array.isArray(candidate.questions) &&
    Array.isArray(candidate.standings) &&
    typeof candidate.closed === "number" &&
    typeof candidate.guestCount === "number" &&
    typeof candidate.maxQuestions === "number"
  );
}

export function useQuizBoard(apiBase: string, initial: QuizBoardDto, locale: Locale, live = true) {
  const [board, setBoard] = useState<QuizBoardDto>(initial);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const saving = useRef(false);
  // Bumped by every change: a read that started before it is ignored.
  const generation = useRef(0);

  useEffect(() => {
    if (!live) {
      return;
    }
    let stopped = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;

    function schedule() {
      window.clearTimeout(timer);
      if (!stopped && !document.hidden) {
        timer = window.setTimeout(() => void poll(), POLL_MS);
      }
    }

    async function poll() {
      if (stopped || controller) {
        return;
      }
      if (saving.current) {
        schedule();
        return;
      }
      const current = new AbortController();
      controller = current;
      const startedAt = generation.current;
      const timeout = window.setTimeout(() => {
        current.abort();
      }, TIMEOUT_MS);
      try {
        const response = await fetch(`${apiBase}/quiz`, { signal: current.signal, cache: "no-store" });
        const data = await readJson(response);
        if (response.ok && isQuizBoard(data) && startedAt === generation.current) {
          setBoard(data);
        }
      } catch {
        // A slow or failed read keeps the last board; the next one tries again.
      } finally {
        window.clearTimeout(timeout);
        controller = null;
        schedule();
      }
    }

    function onVisibilityChange() {
      window.clearTimeout(timer);
      if (!document.hidden) {
        void poll();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [apiBase, live]);

  // Resolves to true when the change was saved.
  const send = useCallback(
    async ({ method, path, body }: QuizBoardRequest): Promise<boolean> => {
      saving.current = true;
      generation.current++;
      setPending(true);
      setFailure(null);
      try {
        const response = await fetch(`${apiBase}${path}`, {
          method,
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await readJson(response);
        if (response.ok && isQuizBoard(data)) {
          setBoard(data);
          return true;
        }
        setFailure(toFailure(data, locale));
        // The board may be stale (a question asked or deleted on another device): reload it.
        if (response.status === 404 || response.status === 409) {
          const fresh = await fetch(`${apiBase}/quiz`, { cache: "no-store" }).then(readJson, () => null);
          if (isQuizBoard(fresh)) {
            setBoard(fresh);
          }
        }
        return false;
      } catch {
        setFailure(networkFailure(locale));
        return false;
      } finally {
        saving.current = false;
        setPending(false);
      }
    },
    [apiBase, locale],
  );

  const dismissFailure = useCallback(() => {
    setFailure(null);
  }, []);

  return { board, pending, failure, send, dismissFailure };
}
