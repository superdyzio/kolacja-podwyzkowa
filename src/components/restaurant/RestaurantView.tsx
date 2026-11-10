import { useCallback, useMemo, useState } from "react";
import { useRestaurantView } from "@/components/hooks/useRestaurantView";
import { useStaffReadout } from "@/components/hooks/useStaffReadout";
import type { Locale } from "@/lib/i18n";
import { formatSavedAt } from "@/lib/offline/readout";
import { staffReadoutFromView, type PlanAspect, type StaffReadoutScope } from "@/lib/offline/staff";
import { staffOfflineMessages } from "@/lib/offline/staff-messages";
import { restaurantMessages } from "@/lib/orders/messages";
import { describeToServe } from "@/lib/orders/summary";
import type { RestaurantViewDto } from "@/types";
import { RestaurantBoard } from "./RestaurantBoard";
import { RsvpDishSummary } from "./RsvpDishSummary";

interface Props {
  // Restaurant API base, e.g. "/api/r/<key>".
  apiBase: string;
  initial: RestaurantViewDto;
  eventName: string;
  locale: Locale;
  // staff-offline-readout (S-27): the tablet's offline copy (this link, until the end of the event's floor window).
  readout?: StaffReadoutScope;
}

// The restaurant's read-only page (restaurant-orders): the header (what is still to serve, refreshed by polling), the
// RSVP dish counts while the event has dish options („Potwierdzone dania”, counts only; live page only), then the
// tablet's board (RestaurantBoard: the plan, diets, prep list and serving per table — no prices).
// staff-offline-readout (S-27): every state the server confirms is saved on this device for the offline readout page
// (`/r/<key>/odczyt`, also served by the readout worker when this page cannot load); while the server cannot be
// reached, the note says when it was saved and links there. The app's denial forgets the copy.
export function RestaurantView({ apiBase, initial, eventName, locale, readout }: Props) {
  const t = restaurantMessages(locale);
  const so = staffOfflineMessages(locale);
  const { view, gone, denied, syncedAt, offline } = useRestaurantView(apiBase, initial);
  const [aspect, setAspect] = useState<NonNullable<PlanAspect> | null>(null);
  const onAspect = useCallback((planVersion: number, ratio: number) => {
    setAspect((previous) =>
      previous?.planVersion === planVersion && previous.aspect === ratio ? previous : { planVersion, aspect: ratio },
    );
  }, []);
  const copy = useMemo(
    () =>
      readout ? staffReadoutFromView(view, aspect?.planVersion === view.seating.planVersion ? aspect : null) : null,
    [readout, view, aspect],
  );
  const saved = useStaffReadout(readout ?? null, copy, syncedAt, denied);

  if (gone) {
    return (
      <div role="alert" className="flex flex-col gap-2 rounded-xl border p-4">
        <h1 className="text-2xl font-bold">{t.goneTitle}</h1>
        <p>{t.goneText}</p>
        {readout && denied && <p className="text-muted-foreground text-sm">{so.liveGone}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="text-muted-foreground text-sm">{t.kicker}</p>
        <h1 className="text-3xl font-bold">{eventName}</h1>
        <p className="text-lg font-medium" aria-live="polite">
          {describeToServe(view.totals.toServe, view.totals.quantity, locale)}
        </p>
        <p className="text-muted-foreground text-sm">{t.refreshes}</p>
        {offline && (
          <p role="status" className="self-start rounded-md bg-amber-500/15 px-2 py-1 text-sm">
            {t.offline}
            {readout && saved && (
              <span data-staff-readout-note className="block">
                {so.liveSaved(formatSavedAt(saved.savedAt, new Date(), locale))}{" "}
                <a href={readout.readoutPath} className="underline underline-offset-4">
                  {so.readoutLink}
                </a>
              </span>
            )}
          </p>
        )}
      </header>
      {view.rsvp && <RsvpDishSummary rsvp={view.rsvp} locale={locale} />}
      <RestaurantBoard view={view} apiBase={apiBase} locale={locale} onAspect={onAspect} />
    </div>
  );
}
