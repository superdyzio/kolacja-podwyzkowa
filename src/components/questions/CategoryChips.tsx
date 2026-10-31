import { Button } from "@/components/ui/button";
import { ALL_CATEGORIES_LABEL, QUESTION_CATEGORIES, QUESTION_CATEGORY_LABELS } from "@/lib/questions/categories";
import type { QuestionCategory } from "@/types";

interface Props {
  // null = „Wszystkie”.
  value: QuestionCategory | null;
  onChange: (category: QuestionCategory | null) => void;
  // Shown next to each label when given (the organizer's list filter).
  counts?: { all: number } & Record<QuestionCategory, number>;
  // Accessible name of the group, e.g. „Kategoria pytania”.
  label: string;
  disabled?: boolean;
}

// Pick one question category or all of them (S-07): a row of toggle buttons, „Wszystkie” first, that wraps on a narrow
// phone. Shared by the question draw panel (guest and organizer), the organizer's list filter and S-08's AI topic.
export function CategoryChips({ value, onChange, counts, label, disabled = false }: Props) {
  const options: { category: QuestionCategory | null; text: string; count?: number }[] = [
    { category: null, text: ALL_CATEGORIES_LABEL, count: counts?.all },
    ...QUESTION_CATEGORIES.map((category) => ({
      category,
      text: QUESTION_CATEGORY_LABELS[category],
      count: counts?.[category],
    })),
  ];

  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map(({ category, text, count }) => {
        const pressed = value === category;
        return (
          <Button
            key={category ?? "all"}
            type="button"
            variant={pressed ? "default" : "outline"}
            aria-pressed={pressed}
            disabled={disabled}
            onClick={() => {
              onChange(category);
            }}
            className="h-11 rounded-full px-4 text-base"
          >
            {text}
            {count !== undefined && <span className={pressed ? "opacity-80" : "text-muted-foreground"}>{count}</span>}
          </Button>
        );
      })}
    </div>
  );
}
