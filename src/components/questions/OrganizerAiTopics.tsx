import { useCallback, useState, type ReactNode } from "react";
import { formatSpend } from "@/lib/ai-topics/cost";
import { EVENT_LIMIT_MESSAGE, formatUsage } from "@/lib/ai-topics/limits";
import { ORGANIZER_TOPIC_STORAGE_KEY, parseUsage } from "@/lib/ai-topics/topic-memory";
import type { AiProviderStatusDto, AiTopicBoardDto } from "@/types";
import { AiTopicPanel } from "./AiTopicPanel";

interface Props {
  // Organizer API base, e.g. "/api/o/<key>".
  apiBase: string;
  initial: AiTopicBoardDto;
  // „Pokaż na TV” under the generated topic (tv-spotlight).
  renderAction?: (text: string) => ReactNode;
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

// The real balance and costs live only in the Anthropic console (the Cost page; the balance is under Billing).
const CONSOLE_COST_URL = "https://platform.claude.com/cost";

// The organizer's AI topics on the questions page (S-08, FR-016, NFR-005): the same generator as the guests', without
// a personal limit (the evening's 300 still apply), the evening's usage, its estimated cost (ai-spend) and which
// provider answers. A failed attempt shows the server's hint about the cause (timeout, rejected key, no credits, …)
// under the message; when the organizer did not fail themself, the latest failed attempt of anyone (a guest's) shows
// the same hint. Guests never see hints or costs.
export function OrganizerAiTopics({ apiBase, initial, renderAction }: Props) {
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
        renderAction={renderAction}
      />
      {hint ? (
        <p className="text-destructive text-sm">Przyczyna: {hint}</p>
      ) : (
        usage.lastFailureHint && (
          <p className="text-destructive text-sm">Ostatnia próba (np. gościa) się nie udała: {usage.lastFailureHint}</p>
        )
      )}
      {(provider.kind === "anthropic" || usage.inputTokens + usage.outputTokens > 0) && (
        <p className="text-muted-foreground text-sm">
          {`Koszt AI od ostatniego resetu licznika: ${formatSpend(usage)} — szacunek z cennika, nie saldo konta. `}
          Saldo i prawdziwe koszty:{" "}
          <a className="underline" href={CONSOLE_COST_URL} target="_blank" rel="noopener noreferrer">
            konsola Anthropic
          </a>{" "}
          (Billing, Cost).
        </p>
      )}
      <p className="text-muted-foreground text-sm">
        {`Goście: najwyżej ${String(usage.guestLimit)} tematów na osobę, wszyscy razem ${String(usage.limit)} na wieczór. Nieudane próby się nie liczą.`}
      </p>
    </div>
  );
}
