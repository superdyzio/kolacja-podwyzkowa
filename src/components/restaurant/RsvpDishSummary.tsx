import type { Locale } from "@/lib/i18n";
import { courseLabel, groupByCourse } from "@/lib/menu/rules";
import { restaurantMessages } from "@/lib/orders/messages";
import type { RestaurantRsvpDto } from "@/types";

interface Props {
  rsvp: RestaurantRsvpDto;
  locale: Locale;
}

// „Potwierdzone dania” on the kitchen tablet (the PR #4 review's decision; guest-rsvp-menu extras): what the kitchen
// needs before the event from the guests' RSVPs — per dish (by course) the number of coming guests who chose it, the
// coming guests and those without a dish. Counts only: no names, ids, prices or per-guest answers. Live page only
// (never in the offline copy).
export function RsvpDishSummary({ rsvp, locale }: Props) {
  const t = restaurantMessages(locale);
  return (
    <section
      aria-labelledby="rsvp-kitchen-heading"
      className="flex flex-col gap-2 rounded-xl border p-4"
      data-rsvp-kitchen
    >
      <h2 id="rsvp-kitchen-heading" className="text-xl font-semibold">
        {t.rsvpHeading}
      </h2>
      <p className="text-muted-foreground text-sm">{t.rsvpIntro}</p>
      <p className="font-medium" data-rsvp-kitchen-counts>
        {t.rsvpCounts(rsvp.coming, rsvp.noDish)}
      </p>
      {rsvp.dishes.length === 0 ? (
        <p className="text-muted-foreground">{t.rsvpNoDishes}</p>
      ) : (
        <div className="flex flex-wrap gap-x-10 gap-y-3">
          {groupByCourse(rsvp.dishes).map((group) => (
            <div key={group.course ?? "none"} className="flex flex-col gap-1">
              <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {courseLabel(group.course, locale)}
              </h3>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((dish) => (
                  <li key={dish.name} className="flex items-baseline gap-2 text-lg" data-rsvp-kitchen-dish={dish.name}>
                    <span className="font-semibold tabular-nums">×{dish.count}</span>
                    <span>{dish.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
