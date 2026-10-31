import { useCallback, useState, useSyncExternalStore } from "react";
import { readJson, toFailure } from "@/components/hooks/api-failure";
import { EMPTY_BASE_MESSAGE, EMPTY_CATEGORY_MESSAGE, pushRecent } from "@/lib/questions/draw";
import { EMPTY_DRAW_MEMORY, parseDrawAnswer, type DrawMemory } from "@/lib/questions/draw-memory";
import type { QuestionCategory } from "@/types";
import { readDrawMemory, subscribeDrawMemory, writeDrawMemory } from "./draw-memory-store";

const OFFLINE_MESSAGE = "Brak połączenia — spróbuj ponownie.";

const noSubscription = () => () => undefined;

// One person's question draw (S-07, FR-015) for the guest's phone and the organizer's questions page. The memory
// (category, recently drawn ids, the last question) lives in this browser's localStorage under `storageKey`
// (draw-memory-store.ts): the server render and hydration use the empty memory, the browser then shows what it
// remembered. The draw is a POST of { category, recent } to `drawUrl`; the answer is shown here only, nothing is
// shared.
//
// `onNoAccess` runs on a 404 (access switched off or the link revoked): the guest page refreshes its shared state.
export function useQuestionDraw(drawUrl: string, storageKey: string, onNoAccess?: () => void) {
  const subscribe = useCallback((listener: () => void) => subscribeDrawMemory(storageKey, listener), [storageKey]);
  const getSnapshot = useCallback(() => readDrawMemory(storageKey), [storageKey]);
  const memory = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_DRAW_MEMORY);
  // False in the server render and during hydration: the stored memory is not read yet, so no draw.
  const ready = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const update = useCallback(
    (change: (current: DrawMemory) => DrawMemory) => {
      writeDrawMemory(storageKey, change(readDrawMemory(storageKey)));
    },
    [storageKey],
  );

  const setCategory = useCallback(
    (category: QuestionCategory | null) => {
      update((current) => ({ ...current, category }));
      setMessage(null);
    },
    [update],
  );

  const draw = useCallback(async () => {
    const { category, recent } = readDrawMemory(storageKey);
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(drawUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, recent }),
      });
      const data = await readJson(response);
      const answer = response.ok ? parseDrawAnswer(data) : null;
      if (answer) {
        const { question } = answer;
        if (question) {
          update((current) => ({ ...current, recent: pushRecent(current.recent, question.id), last: question }));
        } else {
          update((current) => ({ ...current, last: null }));
          setMessage(category ? EMPTY_CATEGORY_MESSAGE : EMPTY_BASE_MESSAGE);
        }
        return;
      }
      setMessage(toFailure(data).message);
      if (response.status === 404) {
        onNoAccess?.();
      }
    } catch {
      // The previous question stays on screen.
      setMessage(OFFLINE_MESSAGE);
    } finally {
      setPending(false);
    }
  }, [drawUrl, onNoAccess, storageKey, update]);

  return { category: memory.category, setCategory, question: memory.last, message, pending, ready, draw };
}
