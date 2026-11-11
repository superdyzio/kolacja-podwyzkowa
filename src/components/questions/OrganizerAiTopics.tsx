import { useCallback, useState, type ReactNode } from "react";
import { aiTopicLimitMessages, formatUsage } from "@/lib/ai-topics/limits";
import { aiTopicUiMessages } from "@/lib/ai-topics/messages";
import { ORGANIZER_TOPIC_STORAGE_KEY, parseUsage } from "@/lib/ai-topics/topic-memory";
import type { Locale } from "@/lib/i18n";
import type { AiTopicUsageDto } from "@/types";
import { AiTopicPanel } from "./AiTopicPanel";

interface Props {
  // Organizer API base: "/api/o/<key>" (the client) or the panel's "/api/panel/events/<id>/klient".
  apiBase: string;
  // The evening's usage — counts only (clientAiUsage).
  initial: AiTopicUsageDto;
  // „Pokaż na TV” under the generated topic (tv-spotlight).
  renderAction?: (text: string) => ReactNode;
  locale: Locale;
}

// The organizer's AI topics on the questions page (S-08, FR-016): the same generator as the guests', without a
// personal limit (the evening's limit still applies) and the evening's usage. Since client-restaurant-split (FR-028)
// the provider, the failure hints and the cost estimate are the venue's („Koszty AI” in the panel), so a failed
// attempt shows only the message.
export function OrganizerAiTopics({ apiBase, initial, renderAction, locale }: Props) {
  const t = aiTopicUiMessages(locale);
  const [usage, setUsage] = useState(initial);

  const onAnswer = useCallback((data: unknown) => {
    const fresh = parseUsage(data);
    if (fresh) {
      setUsage(fresh);
    }
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <AiTopicPanel
        generateUrl={`${apiBase}/ai-topics`}
        storageKey={ORGANIZER_TOPIC_STORAGE_KEY}
        onAnswer={onAnswer}
        blockedMessage={usage.used >= usage.limit ? aiTopicLimitMessages(locale).eventLimit : null}
        status={formatUsage(usage, locale)}
        renderAction={renderAction}
        locale={locale}
      />
      <p className="text-muted-foreground text-sm">{t.limits(usage.guestLimit, usage.limit)}</p>
    </div>
  );
}
