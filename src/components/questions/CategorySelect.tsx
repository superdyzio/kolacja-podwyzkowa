import { QUESTION_CATEGORIES, QUESTION_CATEGORY_LABELS, isQuestionCategory } from "@/lib/questions/categories";
import { cn } from "@/lib/utils";
import type { QuestionCategory } from "@/types";

interface Props {
  id: string;
  value: QuestionCategory;
  onChange: (category: QuestionCategory) => void;
  disabled?: boolean;
  className?: string;
}

// A required choice of one question category (S-07): adding questions and editing one.
export function CategorySelect({ id, value, onChange, disabled = false, className }: Props) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(event) => {
        if (isQuestionCategory(event.target.value)) {
          onChange(event.target.value);
        }
      }}
      className={cn(
        "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-11 rounded-md border px-3 text-base shadow-xs outline-none focus-visible:ring-[3px] disabled:opacity-50",
        className,
      )}
    >
      {QUESTION_CATEGORIES.map((category) => (
        <option key={category} value={category}>
          {QUESTION_CATEGORY_LABELS[category]}
        </option>
      ))}
    </select>
  );
}
