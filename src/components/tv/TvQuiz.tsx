import { podiumMedal, type PodiumMedal } from "@/lib/guesses/place";
import type { Locale } from "@/lib/i18n";
import { quizMessages } from "@/lib/quiz/messages";
import { optionLetter } from "@/lib/quiz/rules";
import { cn } from "@/lib/utils";
import type { TvQuizDto } from "@/types";

interface Props {
  quiz: TvQuizDto;
  locale: Locale;
}

const MEDAL_ICON: Record<PodiumMedal, string> = { gold: "🥇", silver: "🥈", bronze: "🥉" };

// The question's size on the TV in vh: the longer, the smaller, so 200 characters and four options fit on 16:9.
function questionFontSize(text: string): number {
  const length = Array.from(text).length;
  return length <= 50 ? 7 : length <= 100 ? 5.5 : length <= 150 ? 4.5 : 3.8;
}

// The pub quiz on the TV (pub-quiz, S-28; FR-049): its own opaque layer over the seating and the spotlight (z-[25];
// the offline badge z-30 stays on top). The intro, the open question with options A–D and how many answered, the
// reveal (the correct option marked with ✓ and a caption, never by colour alone, with the counts per option) and the
// results: places 1–3 by name with points — the PRD's one exception to „the ranking only at the organizer”. No ids.
export function TvQuiz({ quiz, locale }: Props) {
  const t = quizMessages(locale);
  const question = quiz.question;
  // Up to TV_RESULTS_LIMIT (10) names: more than five rows get a tighter layout, so all fit on 16:9.
  const dense = (quiz.results?.entries.length ?? 0) > 5;

  return (
    <div
      className="absolute inset-0 z-[25] flex flex-col items-center justify-center gap-[4vh] bg-neutral-950 p-[5vh] text-neutral-50"
      data-tv-quiz={quiz.phase}
    >
      <p className="text-[3vh] font-semibold tracking-[0.2em] text-amber-400 uppercase">{t.tvTitle}</p>

      {quiz.phase === "intro" && (
        <div className="flex flex-col items-center gap-[3vh] text-center">
          <p className="text-[9vh] leading-tight font-bold">{t.tvQuestions(quiz.total)}</p>
          <p className="max-w-[80vw] text-[4.5vh] text-neutral-300">{t.tvIntro}</p>
        </div>
      )}

      {question && (quiz.phase === "question" || quiz.phase === "reveal") && (
        <div className="flex w-full max-w-[90vw] flex-col items-center gap-[3.5vh]">
          <p className="text-[3vh] text-neutral-400">{t.tvQuestionOf(question.number, quiz.total)}</p>
          <p
            className="text-center leading-tight font-bold text-balance break-words"
            style={{ fontSize: `${String(questionFontSize(question.text))}vh` }}
          >
            {question.text}
          </p>
          <ul className="grid w-full grid-cols-2 gap-[2vh]">
            {question.options.map((option, index) => {
              const correct = question.correct === index;
              return (
                <li
                  key={index}
                  className={cn(
                    "flex items-center gap-[2vh] rounded-[2vh] border-[0.4vh] px-[3vh] py-[2.2vh]",
                    question.correct === null && "border-neutral-600 bg-neutral-900",
                    question.correct !== null && correct && "border-green-400 bg-green-900/60",
                    question.correct !== null && !correct && "border-neutral-800 bg-neutral-900 opacity-50",
                  )}
                  data-tv-quiz-option={index}
                  data-correct={correct ? "" : undefined}
                >
                  <span className="flex size-[7vh] shrink-0 items-center justify-center rounded-full bg-neutral-50 text-[4vh] font-bold text-neutral-950">
                    {optionLetter(index)}
                  </span>
                  <span className="flex-1 text-[4vh] leading-tight font-semibold break-words">{option}</span>
                  {correct && (
                    <span className="flex flex-col items-end text-green-300">
                      <span className="text-[5vh] leading-none font-bold" aria-hidden>
                        ✓
                      </span>
                      <span className="text-[2vh] font-semibold uppercase">{t.tvCorrect}</span>
                    </span>
                  )}
                  {question.counts && (
                    <span className="shrink-0 text-[3.5vh] font-bold tabular-nums">{question.counts[index] ?? 0}</span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-[3vh] text-neutral-300" aria-live="polite">
            {t.tvAnswered(question.answered)}
          </p>
        </div>
      )}

      {quiz.phase === "results" && quiz.results && (
        <div className="flex w-full max-w-[70vw] flex-col items-center gap-[2.5vh]">
          <p className={cn("leading-tight font-bold", dense ? "text-[5vh]" : "text-[8vh]")}>{t.tvResults}</p>
          {quiz.results.entries.length === 0 ? (
            <p className="text-[4vh] text-neutral-300">{t.tvNoPlayers}</p>
          ) : (
            <ol className={cn("flex w-full flex-col", dense ? "gap-[0.8vh]" : "gap-[1.5vh]")}>
              {quiz.results.entries.map((entry, index) => {
                const medal = podiumMedal(entry.place);
                return (
                  <li
                    key={`${String(index)} ${entry.name}`}
                    className={cn(
                      "flex items-center gap-[2.5vh] rounded-[2vh] bg-neutral-900 px-[3vh]",
                      dense ? "py-[0.6vh]" : "py-[1.6vh]",
                    )}
                    data-tv-quiz-place={entry.place}
                  >
                    <span className="w-[14vh] shrink-0 text-[3.5vh] font-semibold text-amber-300">
                      {medal ? <span aria-hidden>{MEDAL_ICON[medal]} </span> : null}
                      {t.tvPlace(entry.place)}
                    </span>
                    <span className={cn("flex-1 truncate font-bold", dense ? "text-[3.6vh]" : "text-[4.5vh]")}>
                      {entry.name}
                    </span>
                    <span className="shrink-0 text-[3.5vh] tabular-nums">{t.tvPoints(entry.points)}</span>
                  </li>
                );
              })}
            </ol>
          )}
          {quiz.results.more > 0 && <p className="text-[3vh] text-neutral-300">{t.tvMore(quiz.results.more)}</p>}
          <p className="text-[2.6vh] text-neutral-400">{t.tvPlayers(quiz.results.players)}</p>
        </div>
      )}
    </div>
  );
}
