import { dietMessages } from "@/lib/diets/messages";
import { isAllergyTag } from "@/lib/diets/rules";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { DietBoardDto } from "@/types";
import { DietBadges } from "./DietBadges";

interface Props {
  diets: DietBoardDto;
  // The seating is published (else everyone is under „no seat on the plan” and a note says why).
  published: boolean;
  locale: Locale;
  className?: string;
}

// „Diety i alergie” (guest-import-diets, S-23; FR-036): the counts per diet of the present guests, then every
// published table with the seats that have a diet or a note, then the present guests with a diet but no published
// seat. On the tablet (/r/<key>), the client's order page, the panel's preview and both floors. Nothing when nobody
// has a diet.
export function DietSection({ diets, published, locale, className }: Props) {
  if (diets.guests === 0) {
    return null;
  }
  const t = dietMessages(locale);
  return (
    <section
      data-diet-section=""
      aria-labelledby="diet-heading"
      className={cn("flex flex-col gap-3 rounded-xl border border-amber-500/40 p-4", className)}
    >
      <header className="flex flex-col gap-1">
        <h2 id="diet-heading" className="text-xl font-semibold">
          {t.heading(diets.guests)}
        </h2>
        <p className="text-muted-foreground text-sm">{t.intro}</p>
      </header>
      {diets.counts.length > 0 && (
        <ul aria-label={t.countsLabel} className="flex flex-wrap gap-2">
          {diets.counts.map((entry) => (
            <li
              key={entry.tag}
              data-diet-count={entry.tag}
              className={cn(
                "rounded-full px-3 py-1 text-sm font-semibold",
                isAllergyTag(entry.tag)
                  ? "bg-red-600/10 text-red-700 dark:text-red-400"
                  : "bg-amber-500/15 text-amber-900 dark:text-amber-300",
              )}
            >
              {isAllergyTag(entry.tag) ? "! " : ""}
              {t.count(t.labels[entry.tag], entry.count)}
            </li>
          ))}
        </ul>
      )}
      {!published && <p className="text-muted-foreground text-sm">{t.notPublished}</p>}
      {diets.tables.map((table) => (
        <div key={`${table.room} ${table.name}`} data-diet-table="" className="flex flex-col gap-1">
          <h3 className="font-semibold">
            {table.name} <span className="text-muted-foreground text-sm font-normal">{table.room}</span>
          </h3>
          <ul className="flex flex-col gap-1 border-l-4 border-amber-500/60 pl-3">
            {table.seats.map((seat) => (
              <li key={seat.seat} className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm">{t.seat(seat.seat, seat.guestName)}</span>
                <DietBadges diets={seat.diets} note={seat.note} locale={locale} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      {diets.unplaced.length > 0 && (
        <div data-diet-unplaced="" className="flex flex-col gap-1">
          <h3 className="font-semibold">{t.unplacedHeading}</h3>
          {published && <p className="text-muted-foreground text-sm">{t.unplacedText}</p>}
          <ul className="flex flex-col gap-1 pl-3">
            {diets.unplaced.map((guest) => (
              <li key={guest.guestName} className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium">{guest.guestName}</span>
                <DietBadges diets={guest.diets} note={guest.note} locale={locale} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
