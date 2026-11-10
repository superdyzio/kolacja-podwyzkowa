import type { Locale } from "@/lib/i18n";
import { quizMessages } from "@/lib/quiz/messages";
import type { QuizBoardDto } from "@/types";

interface Props {
  board: QuizBoardDto;
  locale: Locale;
}

// The live standings of the client's quiz (pub-quiz, S-28): every player (a guest with an answer to a closed
// question) with the competition place, points and answers. Only the client (and the venue's preview) sees them; the
// TV shows places 1–3 at the results.
export function QuizStandings({ board, locale }: Props) {
  const t = quizMessages(locale);
  return (
    <section
      aria-labelledby="quiz-standings-heading"
      className="flex flex-col gap-3 rounded-xl border p-4 sm:p-6"
      data-quiz-standings={board.standings.length}
    >
      <h2 id="quiz-standings-heading" className="text-xl font-semibold">
        {t.standingsHeading}
      </h2>
      {board.standings.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t.standingsEmpty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t.standingsPlace}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t.standingsName}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  {t.standingsPoints}
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  {t.standingsAnswered}
                </th>
              </tr>
            </thead>
            <tbody>
              {board.standings.map((row) => (
                <tr key={row.guestId} className="border-b last:border-0" data-quiz-standing={row.place}>
                  <td className="py-2 pr-3 tabular-nums">
                    {row.place}.{row.tied ? " =" : ""}
                  </td>
                  <td className="py-2 pr-3 font-medium">{row.name}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{row.points}</td>
                  <td className="py-2 text-right tabular-nums">{row.answered}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-muted-foreground text-xs">{t.standingsNote}</p>
    </section>
  );
}
