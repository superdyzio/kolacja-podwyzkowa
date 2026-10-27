import { useId, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { QUESTION_CATEGORY_LABELS } from "@/lib/questions/categories";
import {
  describeQuestionProblem,
  MAX_QUESTION_LENGTH,
  normalizeQuestionText,
  validateQuestionText,
} from "@/lib/questions/text";
import type { QuestionCategory, QuestionDto } from "@/types";
import { CategorySelect } from "./CategorySelect";

export interface QuestionChange {
  text?: string;
  category?: QuestionCategory;
}

interface Props {
  question: QuestionDto;
  pending: boolean;
  // Saves the changed fields; resolves to true when saved.
  onSave: (change: QuestionChange) => Promise<boolean>;
  onDelete: () => void;
}

// One question on the organizer's list (S-07, FR-014): its text and category, edited in place, or deleted.
export function QuestionRow({ question, pending, onSave, onDelete }: Props) {
  const textId = useId();
  const categoryId = useId();
  const problemId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(question.text);
  const [category, setCategory] = useState<QuestionCategory>(question.category);
  const [problem, setProblem] = useState<string | null>(null);

  function startEditing() {
    setDraft(question.text);
    setCategory(question.category);
    setProblem(null);
    setEditing(true);
  }

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = normalizeQuestionText(draft);
    const textProblem = validateQuestionText(text);
    if (textProblem) {
      setProblem(describeQuestionProblem(textProblem));
      return;
    }
    const change: QuestionChange = {
      ...(text === question.text ? {} : { text }),
      ...(category === question.category ? {} : { category }),
    };
    if (Object.keys(change).length === 0 || (await onSave(change))) {
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <li className="rounded-lg border p-3">
        <form onSubmit={(event) => void save(event)} className="flex flex-col gap-2">
          <label htmlFor={textId} className="sr-only">
            Treść pytania
          </label>
          <Textarea
            id={textId}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setProblem(null);
            }}
            maxLength={MAX_QUESTION_LENGTH * 2}
            rows={3}
            aria-invalid={problem !== null}
            aria-describedby={problem ? problemId : undefined}
            className="text-base"
          />
          {problem && (
            <p id={problemId} role="alert" className="text-destructive text-sm font-medium">
              {problem}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={categoryId} className="sr-only">
              Kategoria
            </label>
            <CategorySelect id={categoryId} value={category} onChange={setCategory} />
            <Button type="submit" disabled={pending} className="h-11">
              Zapisz
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              onClick={() => {
                setEditing(false);
              }}
            >
              Anuluj
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="break-words">{question.text}</p>
        <span className="bg-secondary text-secondary-foreground self-start rounded-full px-2 py-0.5 text-xs">
          {QUESTION_CATEGORY_LABELS[question.category]}
        </span>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button type="button" variant="outline" className="h-10" disabled={pending} onClick={startEditing}>
          Edytuj
        </Button>
        <Button type="button" variant="ghost" className="text-destructive h-10" disabled={pending} onClick={onDelete}>
          Usuń
        </Button>
      </div>
    </li>
  );
}
