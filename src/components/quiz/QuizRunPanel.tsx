import type { useQuizBoard } from "@/components/hooks/useQuizBoard";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { quizMessages } from "@/lib/quiz/messages";
import { correctAnswers, nextQuestion, optionLetter, shownQuestion } from "@/lib/quiz/rules";
import { cn } from "@/lib/utils";
import type { QuizBoardDto } from "@/types";

type Send = ReturnType<typeof useQuizBoard>["send"];

interface Props {
  board: QuizBoardDto;
  pending: boolean;
  send: Send;
  locale: Locale;
}

// „Prowadzenie quizu” (pub-quiz, S-28): what the TV shows now and the next step — the intro, the next question (or
// any question from the list), closing the open one (the TV reveals the correct option with the counts), the results
// on the TV, the end. One step at a time; the end asks first.
export function QuizRunPanel({ board, pending, send, locale }: Props) {
  const t = quizMessages(locale);
  const run = board.run;
  const phase = run?.phase ?? "idle";
  const shown = shownQuestion(board);
  const next = nextQuestion(board.questions);
  const total = board.questions.length;
  const open = phase === "question" && shown !== null;

  function step(body: unknown) {
    void send({ method: "POST", path: "/quiz/run", body });
  }

  const status =
    phase === "idle"
      ? t.statusIdle
      : phase === "intro"
        ? t.statusIntro
        : phase === "results"
          ? t.statusResults
          : phase === "question"
            ? t.statusQuestion(shown?.number ?? 0, total)
            : t.statusReveal(shown?.number ?? 0, total);

  return (
    <section
      aria-labelledby="quiz-run-heading"
      className="flex flex-col gap-4 rounded-xl border p-4 sm:p-6"
      data-quiz-run={phase}
    >
      <h2 id="quiz-run-heading" className="text-xl font-semibold">
        {t.runHeading}
      </h2>
      <p className="font-medium" aria-live="polite" data-quiz-run-status>
        {status}
      </p>

      {shown && (phase === "question" || phase === "reveal") && (
        <div className="bg-muted/50 flex flex-col gap-2 rounded-lg p-3" data-quiz-shown={shown.id}>
          <p className="font-semibold">{shown.text}</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {shown.options.map((option, index) => {
              const isCorrect = phase === "reveal" && index === shown.correct;
              return (
                <li
                  key={index}
                  className={cn(
                    "bg-background flex items-baseline justify-between gap-2 rounded-md border px-2 py-1 text-sm",
                    isCorrect && "border-green-600 bg-green-50 font-semibold text-green-900",
                  )}
                  data-quiz-shown-option={index}
                >
                  <span>
                    {optionLetter(index)}. {option}
                    {isCorrect && ` ✓ ${t.correctMark}`}
                  </span>
                  {phase === "reveal" && (
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {t.optionCount(shown.counts[index] ?? 0)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-muted-foreground text-sm" data-quiz-answered>
            {t.answered(shown.answers, board.guestCount)}
            {phase === "reveal" && ` · ${t.answersSummary(shown.answers, correctAnswers(shown))}`}
          </p>
        </div>
      )}

      {total === 0 ? (
        <p className="text-muted-foreground text-sm">{t.noQuestionsYet}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {phase === "idle" && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                step({ action: "start" });
              }}
            >
              {t.start}
            </Button>
          )}
          {open ? (
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                step({ action: "close" });
              }}
              data-quiz-close
            >
              {t.close}
            </Button>
          ) : (
            next && (
              <Button
                type="button"
                disabled={pending}
                onClick={() => {
                  step({ action: "ask", questionId: next.id });
                }}
                data-quiz-ask-next={next.id}
              >
                {t.askNext(next.number)}
              </Button>
            )
          )}
          {!open && board.closed > 0 && phase !== "results" && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                step({ action: "results" });
              }}
            >
              {t.results}
            </Button>
          )}
          {run && (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (window.confirm(open ? t.confirmEndOpen : t.confirmEnd)) {
                  step({ action: "end" });
                }
              }}
            >
              {t.end}
            </Button>
          )}
        </div>
      )}
      {total > 0 && !next && !open && <p className="text-muted-foreground text-sm">{t.allAsked}</p>}
    </section>
  );
}
