import { useEffect, useId, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { formatSupportClock } from "@/lib/support/format";
import { supportMessages } from "@/lib/support/messages";
import { parseSupportReason } from "@/lib/support/rules";
import type { PlatformRestaurantDto, SupportGrantDto } from "@/types";

interface Props {
  restaurant: PlatformRestaurantDto;
  // This login's live support session in the restaurant, else null.
  grant: SupportGrantDto | null;
  pending: boolean;
  onEnter: (reason: string) => Promise<boolean>;
  onEnd: () => Promise<void>;
  locale: Locale;
}

// „Wejdź jako wsparcie” on a restaurant card of the platform page (admin-support-log, S-13; FR-021): with a reason the
// owner will see, the admin opens the restaurant's data read-only for 60 minutes (the browser then goes to its page).
// While this login's support is live: „Wsparcie aktywne do HH:MM” (the platform's time zone, like the banner, so the
// server render and the browser agree), „Otwórz” and „Zakończ wsparcie”. It turns back into the form once the time
// is up.
export function SupportEntry({ restaurant, grant, pending, onEnter, onEnd, locale }: Props) {
  const t = supportMessages(locale);
  const id = useId();
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  // The expiry time that has passed in this page (a re-entry brings a new one, so the card is live again).
  const [expiredAt, setExpiredAt] = useState<string | null>(null);
  const expiresAt = grant?.expiresAt ?? null;
  const expired = expiresAt !== null && expiredAt === expiresAt;

  // A live session from the server render ends on its own: show the form again when its time is up.
  useEffect(() => {
    if (expiresAt === null) {
      return;
    }
    // setTimeout's delay is a 32-bit integer; a support session lasts 60 minutes.
    const left = Math.min(Math.max(Date.parse(expiresAt) - Date.now(), 0), 2_147_483_647);
    const timer = window.setTimeout(() => {
      setExpiredAt(expiresAt);
    }, left);
    return () => {
      window.clearTimeout(timer);
    };
  }, [expiresAt]);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseSupportReason(reason);
    if (!parsed.ok) {
      setProblem(t.reasonProblems[parsed.problem]);
      return;
    }
    setProblem(null);
    await onEnter(parsed.reason);
  }

  if (grant && !expired) {
    return (
      <div
        className="flex flex-col gap-2 rounded-lg border-2 border-amber-500/70 bg-amber-500/10 p-3"
        data-support-active={restaurant.id}
      >
        <p className="font-medium">{t.activeUntil(formatSupportClock(grant.expiresAt))}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-10">
            <a href={grant.path} aria-label={t.openLabel(restaurant.name)}>
              {t.open}
            </a>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-10"
            disabled={pending}
            aria-label={t.endLabel(restaurant.name)}
            onClick={() => void onEnd()}
          >
            {t.end}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <details className="rounded-lg border p-3" data-support-enter={restaurant.id}>
      <summary className="cursor-pointer font-medium">{t.enterSummary}</summary>
      <form className="mt-3 flex flex-col gap-3" onSubmit={(event) => void submit(event)} noValidate>
        <p className="text-muted-foreground text-sm">{t.enterIntro}</p>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-reason`} className="font-medium">
            {t.reasonLabel}
          </label>
          <textarea
            id={`${id}-reason`}
            value={reason}
            rows={2}
            required
            aria-describedby={`${id}-hint`}
            onChange={(event) => {
              setReason(event.target.value);
            }}
            className="bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
          <p id={`${id}-hint`} className="text-muted-foreground text-sm">
            {t.reasonHint}
          </p>
        </div>
        {problem && (
          <p role="alert" className="text-destructive text-sm">
            {problem}
          </p>
        )}
        <Button
          type="submit"
          variant="outline"
          className="h-10 self-start"
          disabled={pending}
          aria-label={t.enterLabel(restaurant.name)}
        >
          {t.enterButton}
        </Button>
      </form>
    </details>
  );
}
