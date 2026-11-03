import { useCallback, useState, type ReactNode } from "react";
import { formatSpend } from "@/lib/ai-topics/cost";
import { aiTopicLimitMessages, formatUsage } from "@/lib/ai-topics/limits";
import { aiTopicUiMessages } from "@/lib/ai-topics/messages";
import { ORGANIZER_TOPIC_STORAGE_KEY, parseUsage } from "@/lib/ai-topics/topic-memory";
import type { Locale } from "@/lib/i18n";
import type { AiProviderStatusDto, AiTopicBoardDto } from "@/types";
import { AiTopicPanel } from "./AiTopicPanel";

interface Props {
  // Organizer API base, e.g. "/api/o/<key>".
  apiBase: string;
  initial: AiTopicBoardDto;
  // „Pokaż na TV” under the generated topic (tv-spotlight).
  renderAction?: (text: string) => ReactNode;
  locale: Locale;
}

function providerLine(provider: AiProviderStatusDto, locale: Locale): string {
  const t = aiTopicUiMessages(locale);
  if (!provider.ready) {
    return provider.problem ?? t.notConfigured;
  }
  if (provider.kind === "mock") {
    return t.providerMock;
  }
  return t.providerClaude(provider.model);
}

// The real balance and costs live only in the Anthropic console (the Cost page; the balance is under Billing).
const CONSOLE_COST_URL = "https://platform.claude.com/cost";

// The organizer's AI topics on the questions page (S-08, FR-016, NFR-005): the same generator as the guests', without
// a personal limit (the evening's 300 still apply), the evening's usage, its estimated cost (ai-spend) and which
// provider answers. A failed attempt shows the server's hint about the cause (timeout, rejected key, no credits, …)
// under the message; when the organizer did not fail themself, the latest failed attempt of anyone (a guest's) shows
// the same hint. Guests never see hints or costs.
export function OrganizerAiTopics({ apiBase, initial, renderAction, locale }: Props) {
  const t = aiTopicUiMessages(locale);
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
        {providerLine(provider, locale)}
      </p>
      <AiTopicPanel
        generateUrl={`${apiBase}/ai-topics`}
        storageKey={ORGANIZER_TOPIC_STORAGE_KEY}
        onAnswer={onAnswer}
        blockedMessage={usage.used >= usage.limit ? aiTopicLimitMessages(locale).eventLimit : null}
        status={formatUsage(usage, locale)}
        renderAction={renderAction}
        locale={locale}
      />
      {hint ? (
        <p className="text-destructive text-sm">{t.cause(hint)}</p>
      ) : (
        usage.lastFailureHint && <p className="text-destructive text-sm">{t.lastFailed(usage.lastFailureHint)}</p>
      )}
      {(provider.kind === "anthropic" || usage.inputTokens + usage.outputTokens > 0) && (
        <p className="text-muted-foreground text-sm">
          {t.cost(formatSpend(usage, locale))}
          {t.balance}{" "}
          <a className="underline" href={CONSOLE_COST_URL} target="_blank" rel="noopener noreferrer">
            {t.console}
          </a>{" "}
          {t.consoleSuffix}
        </p>
      )}
      <p className="text-muted-foreground text-sm">{t.limits(usage.guestLimit, usage.limit)}</p>
    </div>
  );
}
