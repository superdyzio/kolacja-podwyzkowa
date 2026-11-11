import { useState } from "react";
import { useQuizBoard } from "@/components/hooks/useQuizBoard";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { quizMessages } from "@/lib/quiz/messages";
import { correctAnswers, optionLetter, questionStatus, type QuizQuestionStatus } from "@/lib/quiz/rules";
import { cn } from "@/lib/utils";
import type { QuizBoardDto, QuizQuestionDto } from "@/types";
import { QuizQuestionForm } from "./QuizQuestionForm";
import { QuizRunPanel } from "./QuizRunPanel";
import { QuizStandings } from "./QuizStandings";

interface Props {
  // The client's API base: /api/o/<key> or, in the panel's preview, /api/panel/events/<id>/klient.
  apiBase: string;
  initial: QuizBoardDto;
  locale: Locale;
}

// The client's pub quiz (pub-quiz, S-28; FR-049), also the panel's preview: running it on the TV, the live standings,
// the questions (add, edit and delete while never asked; ask any of them) and the form. Every change replaces the whole
// board; the board is re-read while guests answer from their phones.
export function QuizManager({ apiBase, initial, locale }: Props) {
  const t = quizMessages(locale);
  const { board, pending, failure, send, dismissFailure } = useQuizBoard(apiBase, initial, locale);
  const [editing, setEditing] = useState<number | null>(null);
  const open = board.run?.phase === "question" && board.run.questionId !== null;
  const full = board.questions.length >= board.maxQuestions;

  return (
    <div className="flex flex-col gap-6" data-quiz-manager>
      {failure && (
        <div role="alert" className="border-destructive/40 bg-destructive/5 flex flex-col gap-1 rounded-lg border p-3">
          <p className="text-destructive font-medium">{failure.message}</p>
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={dismissFailure}>
            {t.dismiss}
          </Button>
        </div>
      )}
      <QuizRunPanel board={board} pending={pending} send={send} locale={locale} />
      <QuizStandings board={board} locale={locale} />

      <section aria-labelledby="quiz-questions-heading" className="flex flex-col gap-4 rounded-xl border p-4 sm:p-6">
        <h2 id="quiz-questions-heading" className="text-xl font-semibold">
          {t.questionsHeading(board.questions.length, board.maxQuestions)}
        </h2>
        {board.questions.length > 0 && (
          <ol className="flex flex-col gap-3">
            {board.questions.map((question) => (
              <QuestionRow
                key={question.id}
                question={question}
                status={questionStatus(question, board)}
                editing={editing === question.id}
                canAsk={!open}
                pending={pending}
                locale={locale}
                onAsk={() => {
                  void send({ method: "POST", path: "/quiz/run", body: { action: "ask", questionId: question.id } });
                }}
                onEdit={() => {
                  setEditing(question.id);
                }}
                onCancel={() => {
                  setEditing(null);
                }}
                onSave={async (value) => {
                  const saved = await send({ method: "PATCH", path: `/quiz/questions/${question.id}`, body: value });
                  if (saved) {
                    setEditing(null);
                  }
                  return saved;
                }}
                onDelete={() => {
                  const text =
                    question.answers > 0
                      ? t.confirmDeleteAnswered(question.text, question.answers)
                      : t.confirmDelete(question.text);
                  if (window.confirm(text)) {
                    void send({ method: "DELETE", path: `/quiz/questions/${question.id}` });
                  }
                }}
              />
            ))}
          </ol>
        )}
        {full ? (
          <p className="text-muted-foreground text-sm">{t.full(board.maxQuestions)}</p>
        ) : (
          <div className="flex flex-col gap-2 border-t pt-4">
            <h3 className="font-semibold">{t.addHeading}</h3>
            <QuizQuestionForm
              initial={null}
              pending={pending}
              locale={locale}
              onSubmit={(value) => send({ method: "POST", path: "/quiz/questions", body: value })}
            />
          </div>
        )}
      </section>
    </div>
  );
}

interface RowProps {
  question: QuizQuestionDto;
  status: QuizQuestionStatus;
  editing: boolean;
  canAsk: boolean;
  pending: boolean;
  locale: Locale;
  onAsk: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (value: { text: string; options: string[]; correct: number }) => Promise<boolean>;
  onDelete: () => void;
}

function QuestionRow({
  question,
  status,
  editing,
  canAsk,
  pending,
  locale,
  onAsk,
  onEdit,
  onCancel,
  onSave,
  onDelete,
}: RowProps) {
  const t = quizMessages(locale);
  const statusLabel = {
    draft: t.statusDraft,
    "on-tv": t.statusOnTv,
    asked: t.statusAsked,
    closed: t.statusClosed,
  }[status];
  const asked = question.askedAt !== null;

  return (
    <li
      className={cn("flex flex-col gap-2 rounded-lg border p-3", status === "on-tv" && "border-primary")}
      data-quiz-question={question.id}
      data-quiz-status={status}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">
          {t.questionNumber(question.number)}: {question.text}
        </h3>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs",
            status === "on-tv" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {statusLabel}
        </span>
      </div>
      {editing ? (
        <QuizQuestionForm
          initial={{ text: question.text, options: question.options, correct: question.correct }}
          pending={pending}
          locale={locale}
          onSubmit={onSave}
          onCancel={onCancel}
        />
      ) : (
        <>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {question.options.map((option, index) => (
              <li
                key={index}
                className={cn(index === question.correct && "font-semibold text-green-800")}
                data-quiz-option-correct={index === question.correct ? "" : undefined}
              >
                {optionLetter(index)}. {option}
                {index === question.correct && ` ✓ ${t.correctMark}`}
                {asked && (
                  <span className="text-muted-foreground"> · {t.optionCount(question.counts[index] ?? 0)}</span>
                )}
              </li>
            ))}
          </ul>
          {asked && (
            <p className="text-muted-foreground text-sm">
              {t.answersSummary(question.answers, correctAnswers(question))}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {status === "draft" && canAsk && (
              <Button type="button" size="sm" disabled={pending} onClick={onAsk} data-quiz-ask={question.id}>
                {t.askThis}
              </Button>
            )}
            {!asked && (
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onEdit}>
                {t.edit}
              </Button>
            )}
            {status !== "on-tv" && (
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onDelete}>
                {t.delete}
              </Button>
            )}
          </div>
          {asked && <p className="text-muted-foreground text-xs">{t.lockedHint}</p>}
        </>
      )}
    </li>
  );
}
