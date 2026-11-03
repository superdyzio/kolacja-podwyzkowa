import type { ReactNode } from "react";
import { useQuestionDraw } from "@/components/hooks/useQuestionDraw";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { questionCategoryHints, questionCategoryLabels } from "@/lib/questions/categories";
import { questionUiMessages } from "@/lib/questions/messages";
import { CategoryChips } from "./CategoryChips";

interface Props {
  // The draw route: /api/g/<key>/questions/draw or /api/o/<key>/questions/draw.
  drawUrl: string;
  // localStorage key of this person's draw memory (src/lib/questions/draw-memory.ts).
  storageKey: string;
  onNoAccess?: () => void;
  // Extra action under the drawn question — the organizer's „Pokaż na TV” (tv-spotlight); the guest's phone has none.
  renderAction?: (text: string) => ReactNode;
  locale: Locale;
}

// The question draw (S-07, US-03, FR-015), the same on the guest's phone and the organizer's questions page: pick a
// category (or all), draw, read the question in large type. Only this browser sees what it drew.
export function QuestionDrawPanel({ drawUrl, storageKey, onNoAccess, renderAction, locale }: Props) {
  const t = questionUiMessages(locale);
  const { category, setCategory, question, message, pending, ready, draw } = useQuestionDraw(
    drawUrl,
    storageKey,
    locale,
    onNoAccess,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <CategoryChips label={t.drawCategoryLabel} value={category} onChange={setCategory} locale={locale} />
        <p className="text-muted-foreground text-sm">
          {category ? questionCategoryHints(locale)[category] : t.allHint}
        </p>
      </div>

      <Button type="button" className="h-14 w-full text-lg" disabled={!ready || pending} onClick={() => void draw()}>
        {pending ? t.drawing : question ? t.drawNext : t.draw}
      </Button>

      <div aria-live="polite" className="flex flex-col gap-2">
        {message && <p className="font-medium">{message}</p>}
        {question && (
          <figure className="flex flex-col gap-2 rounded-2xl border-2 p-5">
            <figcaption className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
              {questionCategoryLabels(locale)[question.category]}
            </figcaption>
            <blockquote className="text-2xl leading-snug font-semibold text-balance">{question.text}</blockquote>
          </figure>
        )}
        {question && renderAction?.(question.text)}
      </div>
    </div>
  );
}
