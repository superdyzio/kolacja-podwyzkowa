import { useCallback, useState, useSyncExternalStore } from "react";
import { readJson, toFailure } from "@/components/hooks/api-failure";
import type { Locale } from "@/lib/i18n";
import { pushRecent } from "@/lib/questions/draw";
import { EMPTY_DRAW_MEMORY, parseDrawAnswer, type DrawMemory } from "@/lib/questions/draw-memory";
import { questionMessages, questionUiMessages } from "@/lib/questions/messages";
import type { QuestionCategory } from "@/types";
import { readDrawMemory, subscribeDrawMemory, writeDrawMemory } from "./draw-memory-store";

const noSubscription = () => () => undefined;

// One person's question draw (S-07, FR-015) for the guest's phone and the organizer's questions page. The memory
// (category, recently drawn ids, the last question) lives in this browser's localStorage under `storageKey`
// (draw-memory-store.ts): the server render and hydration use the empty memory, the browser then shows what it
// remembered. The draw is a POST of { category, recent } to `drawUrl`; the answer is shown here only, nothing is
// shared.
//
// `onNoAccess` runs on a 404 (access switched off or the link revoked): the guest page refreshes its shared state.
// Messages are in `locale` (i18n).
export function useQuestionDraw(drawUrl: string, storageKey: string, locale: Locale, onNoAccess?: () => void) {
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
          const t = questionMessages(locale);
          setMessage(category ? t.emptyCategory : t.emptyBase);
        }
        return;
      }
      setMessage(toFailure(data, locale).message);
      if (response.status === 404) {
        onNoAccess?.();
      }
    } catch {
      // The previous question stays on screen.
      setMessage(questionUiMessages(locale).offline);
    } finally {
      setPending(false);
    }
  }, [drawUrl, locale, onNoAccess, storageKey, update]);

  return { category: memory.category, setCategory, question: memory.last, message, pending, ready, draw };
}
