import { useCallback, useState } from "react";
import { useGuestState } from "@/components/hooks/useGuestState";
import { AiTopicPanel } from "@/components/questions/AiTopicPanel";
import { EVENT_LIMIT_MESSAGE, formatRemaining, GUEST_LIMIT_MESSAGE } from "@/lib/ai-topics/limits";
import { GUEST_TOPIC_STORAGE_KEY, parseGuestQuota } from "@/lib/ai-topics/topic-memory";
import type { GuestAiQuotaDto, GuestStateDto } from "@/types";

interface Props {
  // Guest API base, e.g. "/api/g/<key>".
  apiBase: string;
  initial: GuestStateDto;
  // The guest's own quota at render time; every generate answer brings a fresh one.
  initialQuota: GuestAiQuotaDto;
}

// The guest's AI conversation topic on the phone (S-08, US-03, FR-016, NFR-005): a topic in the chosen category (or
// any), seen only on this phone — never on the TV or anyone else's screen — with the remaining count of the guest's 5.
// Reads the page's shared live state (one poll per phone) only to hide itself when access is gone; a generation
// refused with 404 asks that state to refresh now. The quota is not part of the poll: it comes from the page render
// and from every generate answer.
export function GuestTopicView({ apiBase, initial, initialQuota }: Props) {
  const { state, refresh } = useGuestState(apiBase, initial);
  const [quota, setQuota] = useState(initialQuota);
  const onAnswer = useCallback((data: unknown) => {
    const fresh = parseGuestQuota(data);
    if (fresh) {
      setQuota(fresh);
    }
  }, []);

  if (!state) {
    return null;
  }
  const blockedMessage =
    quota.remaining === 0 ? GUEST_LIMIT_MESSAGE : quota.eventExhausted ? EVENT_LIMIT_MESSAGE : null;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">Temat widzisz tylko Ty. Nieudana próba nie zmniejsza limitu.</p>
      <AiTopicPanel
        generateUrl={`${apiBase}/ai-topics`}
        storageKey={GUEST_TOPIC_STORAGE_KEY}
        onAnswer={onAnswer}
        onNoAccess={refresh}
        blockedMessage={blockedMessage}
        status={formatRemaining(quota)}
      />
    </div>
  );
}
