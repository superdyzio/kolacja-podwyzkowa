import type { ReactNode } from "react";
import { useAiTopic, type AiTopicCallbacks } from "@/components/hooks/useAiTopic";
import { Button } from "@/components/ui/button";
import { QUESTION_CATEGORY_HINTS, QUESTION_CATEGORY_LABELS } from "@/lib/questions/categories";
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
}

const ALL_HINT = "Kategorię wybierze AI.";

// The AI topic generator (S-08, US-03, FR-016), the same on the guest's phone and the organizer's questions page:
// pick a category (or all), generate, read the topic in large type. Only this browser sees the topic.
export function AiTopicPanel({ generateUrl, storageKey, blockedMessage = null, status, onAnswer, onNoAccess }: Props) {
  const { category, setCategory, topic, message, pending, ready, generate } = useAiTopic(generateUrl, storageKey, {
    onAnswer,
    onNoAccess,
  });
  const blocked = blockedMessage !== null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <CategoryChips label="Kategoria tematu" value={category} onChange={setCategory} disabled={pending} />
        <p className="text-muted-foreground text-sm">{category ? QUESTION_CATEGORY_HINTS[category] : ALL_HINT}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          className="h-14 w-full text-lg"
          disabled={!ready || pending || blocked}
          onClick={() => void generate()}
        >
          {pending ? "Generuję…" : topic ? "Wygeneruj kolejny" : "Wygeneruj temat z AI"}
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
              {QUESTION_CATEGORY_LABELS[topic.category]} · temat od AI
            </figcaption>
            <blockquote className="text-2xl leading-snug font-semibold text-balance">{topic.text}</blockquote>
          </figure>
        )}
      </div>
    </div>
  );
}
