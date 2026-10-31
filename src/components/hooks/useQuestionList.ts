import { useCallback, useState } from "react";
import { toQuestionDto } from "@/lib/questions/draw-memory";
import type { QuestionListDto } from "@/types";
import { NETWORK_FAILURE, readJson, toFailure, type ApiFailure } from "./api-failure";

// The question base on the organizer's questions page (S-07, FR-014). Every change goes through the API and the list
// is replaced with the one the server answers, so the page never drifts from the database.

export interface QuestionListRequest {
  method: "POST" | "PATCH" | "DELETE";
  // Relative to the organizer API base, e.g. "/questions/12".
  path: string;
  body?: unknown;
}

// The base from an answer (the list itself, a paste result or a starter load), or null when it is not one.
export function parseQuestionList(data: unknown): QuestionListDto | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const { questions, starterMissing } = data as Partial<Record<keyof QuestionListDto, unknown>>;
  if (!Array.isArray(questions) || typeof starterMissing !== "number") {
    return null;
  }
  const parsed = questions.map(toQuestionDto);
  if (parsed.some((question) => question === null)) {
    return null;
  }
  return { questions: parsed.filter((question) => question !== null), starterMissing };
}

export function useQuestionList(apiBase: string, initial: QuestionListDto) {
  const [list, setList] = useState<QuestionListDto>(initial);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  // Resolves to the answer's body when the change was saved, null otherwise (the failure is shown).
  const send = useCallback(
    async ({ method, path, body }: QuestionListRequest): Promise<unknown> => {
      setPending(true);
      setFailure(null);
      try {
        const response = await fetch(`${apiBase}${path}`, {
          method,
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await readJson(response);
        if (response.ok) {
          const fresh = parseQuestionList(data);
          if (fresh) {
            setList(fresh);
          }
          return data;
        }
        setFailure(toFailure(data));
        // The list may be stale (e.g. changed in another tab): reload it so the next try starts from the truth.
        if (response.status === 404 || response.status === 409) {
          const fresh = parseQuestionList(await fetch(`${apiBase}/questions`).then(readJson, () => null));
          if (fresh) {
            setList(fresh);
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

  const dismissFailure = useCallback(() => {
    setFailure(null);
  }, []);

  return { list, pending, failure, send, dismissFailure };
}
