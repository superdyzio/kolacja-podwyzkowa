import { useCallback, useState } from "react";
import { EVENT_LIMIT_MESSAGE, formatUsage } from "@/lib/ai-topics/limits";
import { ORGANIZER_TOPIC_STORAGE_KEY, parseUsage } from "@/lib/ai-topics/topic-memory";
import type { AiProviderStatusDto, AiTopicBoardDto } from "@/types";
import { AiTopicPanel } from "./AiTopicPanel";

interface Props {
  // Organizer API base, e.g. "/api/o/<key>".
  apiBase: string;
  initial: AiTopicBoardDto;
}

function providerLine(provider: AiProviderStatusDto): string {
  if (!provider.ready) {
    return provider.problem ?? "AI nie jest skonfigurowane.";
  }
  if (provider.kind === "mock") {
    return "Dostawca: atrapa AI — przykładowe tematy, bez połączenia z AI.";
  }
  return provider.model ? `Dostawca: Claude (${provider.model}).` : "Dostawca: Claude.";
}

// The organizer's AI topics on the questions page (S-08, FR-016, NFR-005): the same generator as the guests', without
// a personal limit (the evening's 300 still apply), the evening's usage and which provider answers. A failed attempt
// shows the server's hint about the cause (timeout, rejected key, …) under the message; guests never see hints.
export function OrganizerAiTopics({ apiBase, initial }: Props) {
  const [usage, setUsage] = useState(initial.usage);
  const [hint, setHint] = useState<string | null>(null);
  const { provider } = initial;

  const onAnswer = useCallback((data: unknown) => {
    const fresh = parseUsage(data);
    if (fresh) {
      setUsage(fresh);
    }
    const value = typeof data === "object" && data !== null ? (data as { hint?: unknown }).hint : undefined;
    setHint(typeof value === "string" ? value : null);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <p className={provider.ready ? "text-muted-foreground text-sm" : "text-destructive text-sm font-medium"}>
        {providerLine(provider)}
      </p>
      <AiTopicPanel
        generateUrl={`${apiBase}/ai-topics`}
        storageKey={ORGANIZER_TOPIC_STORAGE_KEY}
        onAnswer={onAnswer}
        blockedMessage={usage.used >= usage.limit ? EVENT_LIMIT_MESSAGE : null}
        status={formatUsage(usage)}
      />
      {hint && <p className="text-destructive text-sm">Przyczyna: {hint}</p>}
      <p className="text-muted-foreground text-sm">
        {`Goście: najwyżej ${String(usage.guestLimit)} tematów na osobę, wszyscy razem ${String(usage.limit)} na wieczór. Nieudane próby się nie liczą.`}
      </p>
    </div>
  );
}
