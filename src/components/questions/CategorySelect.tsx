import type { Locale } from "@/lib/i18n";
import { QUESTION_CATEGORIES, isQuestionCategory, questionCategoryLabels } from "@/lib/questions/categories";
import { cn } from "@/lib/utils";
import type { QuestionCategory } from "@/types";

interface Props {
  id: string;
  value: QuestionCategory;
  onChange: (category: QuestionCategory) => void;
  disabled?: boolean;
  className?: string;
  locale: Locale;
}

// A required choice of one question category (S-07): adding questions and editing one.
export function CategorySelect({ id, value, onChange, disabled = false, className, locale }: Props) {
  const labels = questionCategoryLabels(locale);
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
          {labels[category]}
        </option>
      ))}
    </select>
  );
}
