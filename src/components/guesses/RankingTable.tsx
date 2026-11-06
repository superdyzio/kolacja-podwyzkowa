import { describeDifference, formatAmount } from "@/lib/guesses/amount";
import { guessUiMessages } from "@/lib/guesses/messages";
import { podiumMedal, type PodiumMedal } from "@/lib/guesses/place";
import { placeHitters } from "@/lib/guesses/ranking";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { RankingEntryDto } from "@/types";

interface Props {
  entries: RankingEntryDto[];
  locale: Locale;
}

// guess-place: the podium rows in gold, silver and bronze, every hit of the own place in light green (a podium row
// keeps its medal colour and gets the green badge). The medal and the badge also say it without colour.
const MEDAL_ROW: Record<PodiumMedal, string> = {
  gold: "bg-yellow-100 border-l-yellow-500",
  silver: "bg-slate-200/70 border-l-slate-400",
  bronze: "bg-orange-200/70 border-l-orange-700",
};
const MEDAL_ICON: Record<PodiumMedal, string> = { gold: "🥇", silver: "🥈", bronze: "🥉" };
const HIT_ROW = "bg-emerald-50 border-l-emerald-500";

// The whole ranking at a glance (S-06, FR-020), best first: place (shared places marked „remis”), name, guess and how
// far it was. Phone-first: three columns, the difference under the guess, the place prediction under the name. Above
// it a legend of the highlights, below it who hit their own place (the consolation prize list).
export function RankingTable({ entries, locale }: Props) {
  const t = guessUiMessages(locale);
  const hitters = placeHitters(entries);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">{t.rankingLegend}</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t.rankingCaption}</caption>
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                {t.place}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t.guest}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t.guess}
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const medal = podiumMedal(entry.place);
              return (
                <tr
                  key={entry.guestId}
                  className={cn(
                    "border-t border-l-4 border-l-transparent align-top",
                    medal ? MEDAL_ROW[medal] : entry.placeHit && HIT_ROW,
                  )}
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="text-base font-bold">{entry.place}.</span>
                    {medal && (
                      <>
                        <span aria-hidden="true" className="ml-1">
                          {MEDAL_ICON[medal]}
                        </span>
                        <span className="sr-only"> {t.medal[medal]}</span>
                      </>
                    )}
                    {entry.tied && (
                      <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{t.tie}</span>
                    )}
                  </td>
                  <th scope="row" className="px-3 py-2 font-medium break-words">
                    {entry.displayName}
                    {entry.isAbsent && (
                      <span className="text-muted-foreground ml-1 rounded-full border px-2 py-0.5 text-xs font-normal">
                        {t.absent}
                      </span>
                    )}
                    {entry.predictedPlace !== null && (
                      <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs font-normal">
                        <span className="text-muted-foreground">{t.predictedPlace(entry.predictedPlace)}</span>
                        {entry.placeHit && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-900">
                            ✓ {t.placeHit}
                          </span>
                        )}
                      </span>
                    )}
                  </th>
                  <td className="px-3 py-2">
                    <span className="font-medium whitespace-nowrap">{formatAmount(entry.amountGrosze)}</span>
                    <span className="text-muted-foreground block text-xs">
                      {describeDifference(entry.differenceGrosze, locale)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">{t.hittersHeading(hitters.length)}</h3>
        {hitters.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t.hittersNone}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {hitters.map((entry) => (
              <li
                key={entry.guestId}
                className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-sm text-emerald-950"
              >
                {entry.displayName} · {t.predictedPlace(entry.predictedPlace ?? entry.place)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
