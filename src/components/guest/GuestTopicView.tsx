import { useCallback, useState } from "react";
import { useGuestState } from "@/components/hooks/useGuestState";
import { AiTopicPanel } from "@/components/questions/AiTopicPanel";
import { aiTopicLimitMessages, formatRemaining } from "@/lib/ai-topics/limits";
import { GUEST_TOPIC_STORAGE_KEY, parseGuestQuota } from "@/lib/ai-topics/topic-memory";
import { guestPhoneMessages } from "@/lib/guest-links/messages";
import type { Locale } from "@/lib/i18n";
import type { GuestAiQuotaDto, GuestStateDto } from "@/types";

interface Props {
  // Guest API base, e.g. "/api/g/<key>".
  apiBase: string;
  initial: GuestStateDto;
  // The guest's own quota at render time; every generate answer brings a fresh one.
  initialQuota: GuestAiQuotaDto;
  locale: Locale;
}

// The guest's AI conversation topic on the phone (S-08, US-03, FR-016, NFR-005): a topic in the chosen category (or
// any), seen only on this phone — never on the TV or anyone else's screen — with the remaining count of the guest's 5.
// Reads the page's shared live state (one poll per phone) only to hide itself when access is gone; a generation
// refused with 404 asks that state to refresh now. The quota is not part of the poll: it comes from the page render
// and from every generate answer.
export function GuestTopicView({ apiBase, initial, initialQuota, locale }: Props) {
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
  const limits = aiTopicLimitMessages(locale);
  const blockedMessage = quota.remaining === 0 ? limits.guestLimit : quota.eventExhausted ? limits.eventLimit : null;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">{guestPhoneMessages(locale).onlyYouSeeTopic}</p>
      <AiTopicPanel
        generateUrl={`${apiBase}/ai-topics`}
        storageKey={GUEST_TOPIC_STORAGE_KEY}
        onAnswer={onAnswer}
        onNoAccess={refresh}
        blockedMessage={blockedMessage}
        status={formatRemaining(quota, locale)}
        locale={locale}
      />
    </div>
  );
}
