import { useId, useState } from "react";
import { readJson, toFailure } from "@/components/hooks/api-failure";
import { isGuestState } from "@/components/hooks/guest-state-store";
import { useGuestState } from "@/components/hooks/useGuestState";
import type { Locale } from "@/lib/i18n";
import { quizMessages } from "@/lib/quiz/messages";
import { optionLetter } from "@/lib/quiz/rules";
import { cn } from "@/lib/utils";
import type { GuestQuizDto, GuestStateDto } from "@/types";

interface Props {
  // Guest API base, e.g. "/api/g/<key>".
  apiBase: string;
  initial: GuestStateDto;
  locale: Locale;
}

// The guest's pub quiz on the phone (pub-quiz, S-28; FR-049), above the seat while a quiz runs: the intro, the open
// question with the options as big buttons (each tap saved at once, changeable until the client closes it), the
// correct option with right / wrong after the close, the own points and, at the results, the own place. Only the
// guest's OWN answer, points and place — never other guests'. Reads the page's shared live state (one poll per phone);
// nothing while no quiz runs, the module is off or access is gone.
export function GuestQuizView({ apiBase, initial, locale }: Props) {
  const t = quizMessages(locale);
  const { state, push, refresh } = useGuestState(apiBase, initial);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const headingId = useId();
  // Typed as always present, but an answer of older code (during a deploy) may lack it.
  const quiz: GuestQuizDto | null | undefined = state?.quiz;

  if (!quiz) {
    return null;
  }

  async function answer(questionId: number, option: number) {
    setSaving(true);
    setProblem(null);
    try {
      const response = await fetch(`${apiBase}/quiz`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, option }),
      });
      const data = await readJson(response);
      if (response.ok && isGuestState(data)) {
        push(data);
        return;
      }
      if (response.status !== 404) {
        // Closed meanwhile (409) or an option gone (400): say so and show the fresh state.
        setProblem(toFailure(data, locale).message);
      }
      refresh();
    } catch {
      setProblem(t.guestOffline);
    } finally {
      setSaving(false);
    }
  }

  const question = quiz.question;

  return (
    <section aria-labelledby={headingId} data-guest-quiz={quiz.phase} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-xl font-semibold">
        {t.guestHeading}
      </h2>
      <div className="border-primary/40 flex flex-col gap-4 rounded-2xl border-2 p-5">
        {quiz.phase === "intro" && <p className="text-lg font-medium">{t.guestIntro(quiz.total)}</p>}

        {question && (quiz.phase === "question" || quiz.phase === "reveal") && (
          <>
            <p className="text-muted-foreground text-sm">{t.guestQuestionOf(question.number, quiz.total)}</p>
            <p className="text-xl font-semibold" data-guest-quiz-question={question.id}>
              {question.text}
            </p>
            <div role="group" aria-label={question.text} className="flex flex-col gap-2">
              {question.options.map((option, index) => {
                const letter = optionLetter(index);
                const chosen = quiz.answer === index;
                const isCorrect = question.correct === index;
                const revealed = question.correct !== null;
                return (
                  <button
                    key={index}
                    type="button"
                    aria-pressed={chosen}
                    aria-label={t.optionAria(letter, option)}
                    disabled={saving || revealed}
                    data-guest-quiz-option={index}
                    data-chosen={chosen ? "" : undefined}
                    data-correct={revealed && isCorrect ? "" : undefined}
                    className={cn(
                      "flex min-h-14 items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-base transition-colors",
                      "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
                      !revealed && chosen && "border-primary bg-primary/10 font-semibold",
                      !revealed && !chosen && "hover:bg-accent",
                      revealed && isCorrect && "border-green-600 bg-green-50 font-semibold text-green-900",
                      revealed && !isCorrect && chosen && "border-destructive/60 bg-destructive/5",
                      revealed && !isCorrect && !chosen && "opacity-60",
                    )}
                    onClick={() => {
                      if (!chosen) {
                        void answer(question.id, index);
                      }
                    }}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border font-bold">
                      {letter}
                    </span>
                    <span className="flex-1">{option}</span>
                    {revealed && isCorrect && <span aria-hidden="true">✓</span>}
                    {chosen && <span className="text-muted-foreground text-xs">{t.guestYourAnswer}</span>}
                  </button>
                );
              })}
            </div>
            {quiz.phase === "question" && (
              <p className="text-muted-foreground text-sm" role="status">
                {quiz.answer === null ? t.guestPick : t.guestSaved}
              </p>
            )}
            {quiz.phase === "reveal" && question.correct !== null && (
              <div className="flex flex-col gap-1" role="status" data-guest-quiz-verdict>
                <p className="text-lg font-semibold">
                  {quiz.answer === null
                    ? t.guestNoAnswer
                    : quiz.answer === question.correct
                      ? t.guestRight
                      : t.guestWrong}
                </p>
                <p>{t.guestCorrect(optionLetter(question.correct), question.options[question.correct] ?? "")}</p>
                <p className="text-muted-foreground text-sm">{t.guestWaiting}</p>
              </div>
            )}
          </>
        )}

        {quiz.phase === "results" && (
          <div className="flex flex-col gap-1" data-guest-quiz-result>
            {quiz.result ? (
              <p className="text-2xl font-bold">{t.guestPlace(quiz.result.place, quiz.result.players)}</p>
            ) : (
              <p className="font-medium">{t.guestNotPlayed}</p>
            )}
          </div>
        )}

        {quiz.closed > 0 && (
          <p className="text-sm font-medium" data-guest-quiz-points>
            {t.guestPoints(quiz.points, quiz.closed)}
          </p>
        )}
        {problem && (
          <p role="alert" className="text-destructive font-medium">
            {problem}
          </p>
        )}
      </div>
    </section>
  );
}
