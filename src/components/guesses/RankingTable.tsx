import { describeDifference, formatAmount } from "@/lib/guesses/amount";
import type { RankingEntryDto } from "@/types";

interface Props {
  entries: RankingEntryDto[];
}

// The whole ranking at a glance (S-06, FR-020), best first: place (shared places marked „remis”), name, guess and how
// far it was. Phone-first: three columns, the difference under the guess.
export function RankingTable({ entries }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Ranking strzałów, od najbliższego prawidłowej kwocie</caption>
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Miejsce
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Gość
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Strzał
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.guestId} className="border-t align-top">
              <td className="px-3 py-2">
                <span className="text-base font-bold">{entry.place}.</span>
                {entry.tied && (
                  <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">remis</span>
                )}
              </td>
              <th scope="row" className="px-3 py-2 font-medium break-words">
                {entry.displayName}
                {entry.isAbsent && (
                  <span className="text-muted-foreground ml-1 rounded-full border px-2 py-0.5 text-xs font-normal">
                    nieobecny
                  </span>
                )}
              </th>
              <td className="px-3 py-2">
                <span className="font-medium whitespace-nowrap">{formatAmount(entry.amountGrosze)}</span>
                <span className="text-muted-foreground block text-xs">
                  {describeDifference(entry.differenceGrosze)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
