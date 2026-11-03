import type { ReactNode } from "react";
import { useAiTopic, type AiTopicCallbacks } from "@/components/hooks/useAiTopic";
import { Button } from "@/components/ui/button";
import { aiTopicUiMessages } from "@/lib/ai-topics/messages";
import type { Locale } from "@/lib/i18n";
import { questionCategoryHints, questionCategoryLabels } from "@/lib/questions/categories";
import { CategoryChips } from "./CategoryChips";

interface Props extends AiTopicCallbacks {
  // The generate route: /api/g/<key>/ai-topics or /api/o/<key>/ai-topics.
  generateUrl: string;
  // localStorage key of this person's topic memory (src/lib/ai-topics/topic-memory.ts).
  storageKey: string;
  // When set, generating is not possible (e.g. the guest's 5 are used up) and this says why.
  blockedMessage?: string | null;
  // Shown under the button, e.g. „Zostało 3 z 5”.
  status?: ReactNode;
  // Extra action under the topic — the organizer's „Pokaż na TV” (tv-spotlight); the guest's phone has none.
  renderAction?: (text: string) => ReactNode;
  locale: Locale;
}

// The AI topic generator (S-08, US-03, FR-016), the same on the guest's phone and the organizer's questions page:
// pick a category (or all), generate, read the topic in large type. Only this browser sees the topic.
export function AiTopicPanel({
  generateUrl,
  storageKey,
  blockedMessage = null,
  status,
  onAnswer,
  onNoAccess,
  renderAction,
  locale,
}: Props) {
  const t = aiTopicUiMessages(locale);
  const { category, setCategory, topic, message, pending, ready, generate } = useAiTopic(
    generateUrl,
    storageKey,
    locale,
    { onAnswer, onNoAccess },
  );
  const blocked = blockedMessage !== null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <CategoryChips
          label={t.categoryLabel}
          value={category}
          onChange={setCategory}
          disabled={pending}
          locale={locale}
        />
        <p className="text-muted-foreground text-sm">
          {category ? questionCategoryHints(locale)[category] : t.allHint}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          className="h-14 w-full text-lg"
          disabled={!ready || pending || blocked}
          onClick={() => void generate()}
        >
          {pending ? t.generating : topic ? t.generateNext : t.generate}
        </Button>
        {status && <p className="text-muted-foreground text-center text-sm">{status}</p>}
      </div>

      <div aria-live="polite" className="flex flex-col gap-2">
        {blocked ? (
          <p className="font-medium">{blockedMessage}</p>
        ) : (
          message && <p className="font-medium">{message}</p>
        )}
        {topic && (
          <figure className="flex flex-col gap-2 rounded-2xl border-2 p-5">
            <figcaption className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
              {t.topicCaption(questionCategoryLabels(locale)[topic.category])}
            </figcaption>
            <blockquote className="text-2xl leading-snug font-semibold text-balance">{topic.text}</blockquote>
          </figure>
        )}
        {topic && renderAction?.(topic.text)}
      </div>
    </div>
  );
}
