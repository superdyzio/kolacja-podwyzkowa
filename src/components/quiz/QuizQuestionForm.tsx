import { useId, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/lib/i18n";
import { quizMessages } from "@/lib/quiz/messages";
import {
  MAX_QUIZ_OPTION,
  MAX_QUIZ_OPTIONS,
  MAX_QUIZ_TEXT,
  optionLetter,
  parseQuizQuestion,
  quizProblemText,
  type QuizQuestionInput,
} from "@/lib/quiz/rules";

interface Props {
  // The question being edited, or null for a new one.
  initial: { text: string; options: string[]; correct: number } | null;
  pending: boolean;
  // Resolves to true when the server saved it (the form then clears or closes).
  onSubmit: (value: QuizQuestionInput) => Promise<boolean>;
  onCancel?: () => void;
  locale: Locale;
}

function padOptions(options: readonly string[]): string[] {
  return Array.from({ length: MAX_QUIZ_OPTIONS }, (_, index) => options[index] ?? "");
}

// The add / edit form of a quiz question (pub-quiz, S-28): the text, four option fields (A and B required, C and D
// optional) and the correct one as radios. Checked with the server's rule before sending (same messages); the server
// checks again.
export function QuizQuestionForm({ initial, pending, onSubmit, onCancel, locale }: Props) {
  const t = quizMessages(locale);
  const id = useId();
  const [text, setText] = useState(initial?.text ?? "");
  const [options, setOptions] = useState(() => padOptions(initial?.options ?? []));
  const [correct, setCorrect] = useState(initial?.correct ?? 0);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = parseQuizQuestion({ text, options, correct });
    if (!checked.ok) {
      setProblem(quizProblemText(checked.problem, locale));
      return;
    }
    setProblem(null);
    const saved = await onSubmit(checked.value);
    if (saved && initial === null) {
      setText("");
      setOptions(padOptions([]));
      setCorrect(0);
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => void submit(event)}
      data-quiz-form={initial ? "edit" : "add"}
      noValidate
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-text`} className="text-sm font-medium">
          {t.textLabel}
        </label>
        <Input
          id={`${id}-text`}
          value={text}
          maxLength={MAX_QUIZ_TEXT + 20}
          placeholder={t.textPlaceholder}
          onChange={(event) => {
            setText(event.target.value);
          }}
          data-quiz-text
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t.correctLegend}</legend>
        {options.map((option, index) => {
          const letter = optionLetter(index);
          return (
            <div key={letter} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${id}-correct`}
                id={`${id}-correct-${index}`}
                className="accent-primary size-5 shrink-0"
                checked={correct === index}
                onChange={() => {
                  setCorrect(index);
                }}
                aria-label={t.correctLabel(letter)}
                data-quiz-correct={index}
              />
              <label htmlFor={`${id}-option-${index}`} className="w-6 shrink-0 text-sm font-semibold">
                {letter}
              </label>
              <Input
                id={`${id}-option-${index}`}
                value={option}
                maxLength={MAX_QUIZ_OPTION + 20}
                placeholder={t.optionPlaceholder(letter)}
                aria-label={t.optionLabel(letter)}
                onChange={(event) => {
                  const next = [...options];
                  next[index] = event.target.value;
                  setOptions(next);
                }}
                data-quiz-option={index}
              />
            </div>
          );
        })}
      </fieldset>
      <p className="text-muted-foreground text-xs">{t.formHint}</p>
      {problem && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {initial ? t.save : t.add}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
            {t.cancel}
          </Button>
        )}
      </div>
    </form>
  );
}
