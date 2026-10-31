import { useCallback, useState, useSyncExternalStore } from "react";
import { readJson, toFailure } from "@/components/hooks/api-failure";
import { AI_CLIENT_TIMEOUT_MS, FAILED_MESSAGE } from "@/lib/ai-topics/limits";
import {
  EMPTY_TOPIC_MEMORY,
  parseTopic,
  parseTopicMemory,
  serializeTopicMemory,
  type TopicMemory,
} from "@/lib/ai-topics/topic-memory";
import type { QuestionCategory } from "@/types";
import { createLocalStore } from "./local-store";

const memoryStore = createLocalStore<TopicMemory>(parseTopicMemory, serializeTopicMemory);

const noSubscription = () => () => undefined;

export interface AiTopicCallbacks {
  // Every answer body (success or error), so the parent can take the quota or usage from it.
  onAnswer?: (data: unknown) => void;
  // A 404: access switched off or the link revoked (the guest page refreshes its shared state).
  onNoAccess?: () => void;
}

// One person's AI topic generator (S-08, FR-016) for the guest's phone and the organizer's questions page. The memory
// (category and the last topic) lives in this browser's localStorage under `storageKey`: the server render and
// hydration use the empty memory, the browser then shows what it remembered. A generation is a POST of { category }
// to `generateUrl`; the browser gives up after AI_CLIENT_TIMEOUT_MS (the server aborts the AI at 9 s). On any failure
// the previous topic stays and the server's Polish message shows.
export function useAiTopic(generateUrl: string, storageKey: string, { onAnswer, onNoAccess }: AiTopicCallbacks = {}) {
  const subscribe = useCallback((listener: () => void) => memoryStore.subscribe(storageKey, listener), [storageKey]);
  const getSnapshot = useCallback(() => memoryStore.read(storageKey), [storageKey]);
  const memory = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_TOPIC_MEMORY);
  // False in the server render and during hydration: the stored memory is not read yet, so no generation.
  const ready = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const update = useCallback(
    (change: (current: TopicMemory) => TopicMemory) => {
      memoryStore.write(storageKey, change(memoryStore.read(storageKey)));
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

  const generate = useCallback(async () => {
    const { category } = memoryStore.read(storageKey);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, AI_CLIENT_TIMEOUT_MS);
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(generateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
        signal: controller.signal,
      });
      const data = await readJson(response);
      onAnswer?.(data);
      const topic = response.ok ? parseTopic((data as { topic?: unknown } | null)?.topic) : null;
      if (topic) {
        update((current) => ({ ...current, last: topic }));
        return;
      }
      setMessage(response.ok ? FAILED_MESSAGE : toFailure(data).message);
      if (response.status === 404) {
        onNoAccess?.();
      }
    } catch {
      // Offline or the browser's own deadline: the previous topic stays on screen.
      setMessage(FAILED_MESSAGE);
    } finally {
      clearTimeout(timer);
      setPending(false);
    }
  }, [generateUrl, onAnswer, onNoAccess, storageKey, update]);

  return { category: memory.category, setCategory, topic: memory.last, message, pending, ready, generate };
}
