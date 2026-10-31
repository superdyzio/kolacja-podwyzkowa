import type { ReactNode } from "react";
import { useQuestionDraw } from "@/components/hooks/useQuestionDraw";
import { Button } from "@/components/ui/button";
import { QUESTION_CATEGORY_HINTS, QUESTION_CATEGORY_LABELS } from "@/lib/questions/categories";
import { CategoryChips } from "./CategoryChips";

interface Props {
  // The draw route: /api/g/<key>/questions/draw or /api/o/<key>/questions/draw.
  drawUrl: string;
  // localStorage key of this person's draw memory (src/lib/questions/draw-memory.ts).
  storageKey: string;
  onNoAccess?: () => void;
  // Extra action under the drawn question — the organizer's „Pokaż na TV” (tv-spotlight); the guest's phone has none.
  renderAction?: (text: string) => ReactNode;
}

const ALL_HINT = "Z dowolnej kategorii.";

// The question draw (S-07, US-03, FR-015), the same on the guest's phone and the organizer's questions page: pick a
// category (or all), draw, read the question in large type. Only this browser sees what it drew.
export function QuestionDrawPanel({ drawUrl, storageKey, onNoAccess, renderAction }: Props) {
  const { category, setCategory, question, message, pending, ready, draw } = useQuestionDraw(
    drawUrl,
    storageKey,
    onNoAccess,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <CategoryChips label="Kategoria pytania" value={category} onChange={setCategory} />
        <p className="text-muted-foreground text-sm">{category ? QUESTION_CATEGORY_HINTS[category] : ALL_HINT}</p>
      </div>

      <Button type="button" className="h-14 w-full text-lg" disabled={!ready || pending} onClick={() => void draw()}>
        {pending ? "Losuję…" : question ? "Losuj kolejne" : "Losuj pytanie"}
      </Button>

      <div aria-live="polite" className="flex flex-col gap-2">
        {message && <p className="font-medium">{message}</p>}
        {question && (
          <figure className="flex flex-col gap-2 rounded-2xl border-2 p-5">
            <figcaption className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
              {QUESTION_CATEGORY_LABELS[question.category]}
            </figcaption>
            <blockquote className="text-2xl leading-snug font-semibold text-balance">{question.text}</blockquote>
          </figure>
        )}
        {question && renderAction?.(question.text)}
      </div>
    </div>
  );
}
