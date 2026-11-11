import { useId, useState } from "react";
import { readJson, toFailure } from "@/components/hooks/api-failure";
import { isGuestState } from "@/components/hooks/guest-state-store";
import { useGuestState } from "@/components/hooks/useGuestState";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/events/dates";
import type { Locale } from "@/lib/i18n";
import { courseLabel, groupByCourse } from "@/lib/menu/rules";
import { rsvpMessages } from "@/lib/rsvp/messages";
import { cn } from "@/lib/utils";
import type { GuestRsvpDto, GuestStateDto } from "@/types";

interface Props {
  // Guest API base, e.g. "/api/g/<key>".
  apiBase: string;
  initial: GuestStateDto;
  locale: Locale;
  // Where on the page this copy sits: "open" above the seat (answering), "closed" at the very end (read-only).
  placement: "open" | "closed";
}

// The guest's RSVP on the phone (guest-rsvp-menu, S-25; FR-039): „Przyjdę” / „Nie przyjdę” and — when coming and the
// client offers dishes — one dish, each tap saved at once, until the deadline. Mounted twice on the page and shown by
// the copy whose placement matches `rsvp.open`, so a close (the deadline passing, „Zamknij teraz”) moves the section
// from the top to the bottom within one poll. Reads the page's shared live state (one poll per phone); nothing while
// RSVP is off or access is gone (the seat section says why).
export function GuestRsvpView({ apiBase, initial, locale, placement }: Props) {
  const t = rsvpMessages(locale);
  const { state, push, refresh } = useGuestState(apiBase, initial);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const headingId = useId();
  const rsvp: GuestRsvpDto | null | undefined = state?.rsvp;

  // Nothing while RSVP is off or access is gone (rsvp undefined), and nothing in the other placement.
  if (rsvp?.open !== (placement === "open")) {
    return null;
  }

  async function save(attending: boolean, dish: string | null) {
    setSaving(true);
    setProblem(null);
    setJustSaved(false);
    try {
      const response = await fetch(`${apiBase}/rsvp`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attending, dish: attending ? dish : null }),
      });
      const data = await readJson(response);
      if (response.ok && isGuestState(data)) {
        push(data);
        setJustSaved(true);
        return;
      }
      if (response.status === 404) {
        // Access is gone: the next poll clears the page.
        refresh();
        return;
      }
      setProblem(toFailure(data, locale).message);
      // Closed meanwhile (409) or the dish withdrawn (400): show the fresh state.
      refresh();
    } catch {
      setProblem(t.offline);
    } finally {
      setSaving(false);
    }
  }

  if (!rsvp.open) {
    return (
      <section aria-labelledby={headingId} data-guest-rsvp="closed" className="flex flex-col gap-3">
        <h2 id={headingId} className="text-xl font-semibold">
          {t.guestClosedHeading}
        </h2>
        <div className="flex flex-col gap-2 rounded-2xl border p-5">
          <p className="font-medium">{t.closed}</p>
          <p>
            <span className="text-muted-foreground">{t.yourAnswer}: </span>
            <span className="font-semibold" data-rsvp-answer={answerKey(rsvp.attending)}>
              {rsvp.attending === true ? t.yes : rsvp.attending === false ? t.no : t.noAnswer}
            </span>
          </p>
          {rsvp.attending === true && rsvp.dish !== null && <p>{t.dishText(rsvp.dish)}</p>}
          {rsvp.byOrganizer && <p className="text-muted-foreground text-sm">{t.byOrganizer}</p>}
          <p className="text-muted-foreground text-sm">{t.closedHint}</p>
        </div>
      </section>
    );
  }

  const { attending, dish, options } = rsvp;
  const announcement = justSaved ? (attending === false ? t.savedNotComing : t.savedComing(dish)) : "";

  return (
    <section aria-labelledby={headingId} data-guest-rsvp="open" className="flex flex-col gap-3">
      <h2 id={headingId} className="text-xl font-semibold">
        {t.guestHeading}
      </h2>
      <div className="flex flex-col gap-4 rounded-2xl border-2 p-5">
        <p className="text-muted-foreground text-sm">{t.guestDeadline(formatDateTime(rsvp.deadline, locale))}</p>
        <div role="group" aria-label={t.attendanceGroup} className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={attending === true ? "default" : "outline"}
            aria-pressed={attending === true}
            data-rsvp-choice="yes"
            className="h-12 text-base"
            disabled={saving}
            onClick={() => {
              if (attending !== true) {
                void save(true, null);
              }
            }}
          >
            {t.yes}
          </Button>
          <Button
            type="button"
            variant={attending === false ? "default" : "outline"}
            aria-pressed={attending === false}
            data-rsvp-choice="no"
            className="h-12 text-base"
            disabled={saving}
            onClick={() => {
              if (attending !== false) {
                void save(false, null);
              }
            }}
          >
            {t.no}
          </Button>
        </div>

        {attending === true && options.length > 0 && (
          <fieldset className="flex flex-col gap-3" disabled={saving}>
            <legend className="text-lg font-medium">{t.dishLabel}</legend>
            <p className="text-muted-foreground -mt-1 text-sm">{t.dishHint}</p>
            {groupByCourse(options).map((group) => (
              <div key={group.course ?? "none"} className="flex flex-col gap-2">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  {courseLabel(group.course, locale)}
                </p>
                {group.items.map((option) => {
                  const checked = dish !== null && dish.toLocaleLowerCase() === option.name.toLocaleLowerCase();
                  return (
                    <label
                      key={option.name}
                      className={cn(
                        "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-2 text-base",
                        checked && "border-primary bg-primary/5 font-semibold",
                      )}
                    >
                      <input
                        type="radio"
                        name={`${headingId}-dish`}
                        value={option.name}
                        checked={checked}
                        data-rsvp-dish-option={option.name}
                        className="size-5"
                        onChange={() => {
                          void save(true, option.name);
                        }}
                      />
                      {option.name}
                    </label>
                  );
                })}
              </div>
            ))}
            {dish === null && <p className="text-muted-foreground text-sm">{t.noDishChosen}</p>}
          </fieldset>
        )}

        {rsvp.byOrganizer && <p className="text-muted-foreground text-sm">{t.byOrganizer}</p>}
        {problem && (
          <p role="alert" className="text-destructive font-medium">
            {problem}
          </p>
        )}
        {justSaved && (
          <p role="status" className="font-medium text-emerald-700">
            {announcement}
          </p>
        )}
      </div>
    </section>
  );
}

function answerKey(attending: boolean | null): "yes" | "no" | "none" {
  return attending === true ? "yes" : attending === false ? "no" : "none";
}
