import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type ApiFailure, networkFailure, readJson, toFailure } from "@/components/hooks/api-failure";
import { useBrandingApi } from "@/components/hooks/useBrandingApi";
import { formatEventDate } from "@/lib/events/dates";
import type { Locale } from "@/lib/i18n/locale";
import { privacyMessages } from "@/lib/privacy/messages";
import { parseRetentionDays } from "@/lib/privacy/rules";
import type { RetentionPreviewDto, RetentionSettingsDto } from "@/types";

// „Prywatność danych gości” for the owner (privacy-retention, S-26; FR-040): how many days after an event its guests'
// data is kept. One save at a time (the shared one-action hook); every answer replaces the setting shown. A SHORTER
// term is checked first (retention-preview, the PR #4 review's decision 6: GET …/retention?days=<n>): when it would
// delete the guests' data of some events at once, a confirm names how many (and the latest one's date) before the
// PATCH; when it deletes nothing, nothing extra is asked. A failed check saves nothing.
interface Props {
  initial: RetentionSettingsDto;
  locale: Locale;
}

function parseSettings(data: unknown): RetentionSettingsDto | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const { restaurantId, guestRetentionDays, minDays, maxDays } = data as Record<string, unknown>;
  return typeof restaurantId === "number" &&
    typeof guestRetentionDays === "number" &&
    typeof minDays === "number" &&
    typeof maxDays === "number"
    ? { restaurantId, guestRetentionDays, minDays, maxDays }
    : null;
}

function parsePreview(data: unknown): RetentionPreviewDto | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const { restaurantId, guestRetentionDays, days, events, latestEventDate } = data as Record<string, unknown>;
  return typeof restaurantId === "number" &&
    typeof guestRetentionDays === "number" &&
    typeof days === "number" &&
    typeof events === "number" &&
    (events > 0 ? typeof latestEventDate === "string" : latestEventDate === null)
    ? { restaurantId, guestRetentionDays, days, events, latestEventDate: latestEventDate as string | null }
    : null;
}

export function RetentionSettingsForm({ initial, locale }: Props) {
  const t = privacyMessages(locale);
  const url = `/api/panel/restaurants/${String(initial.restaurantId)}/retention`;
  const { branding: settings, pending, failure, saved, send } = useBrandingApi(initial, parseSettings, locale);
  const [text, setText] = useState(String(initial.guestRetentionDays));
  const [problem, setProblem] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkFailure, setCheckFailure] = useState<ApiFailure | null>(null);
  const busy = pending || checking;
  const shownFailure = checkFailure ?? failure;

  // The preview of a shorter term: true = go on with the PATCH (nothing lost, or the owner confirmed).
  async function confirmShorter(days: number): Promise<boolean> {
    setChecking(true);
    setCheckFailure(null);
    let preview: RetentionPreviewDto | null;
    try {
      const response = await fetch(`${url}?days=${String(days)}`);
      const data = await readJson(response);
      preview = response.ok ? parsePreview(data) : null;
      if (!preview) {
        setCheckFailure(toFailure(data, locale));
        return false;
      }
    } catch {
      setCheckFailure(networkFailure(locale));
      return false;
    } finally {
      setChecking(false);
    }
    if (preview.events === 0 || preview.latestEventDate === null) {
      return true;
    }
    return window.confirm(t.confirmShorten(preview.events, formatEventDate(preview.latestEventDate, locale), days));
  }

  async function save(days: number): Promise<void> {
    setCheckFailure(null);
    if (days < settings.guestRetentionDays && !(await confirmShorter(days))) {
      return;
    }
    await send(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestRetentionDays: days }),
    });
  }

  return (
    <form
      className="flex flex-col gap-3"
      data-retention-form={settings.guestRetentionDays}
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) {
          return;
        }
        const days = parseRetentionDays(text.trim() === "" ? Number.NaN : Number(text));
        if (!days.ok) {
          setProblem(true);
          return;
        }
        setProblem(false);
        void save(days.days);
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="font-medium">{t.daysLabel}</span>
        <span className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={settings.minDays}
            max={settings.maxDays}
            step={1}
            required
            value={text}
            onChange={(event) => {
              setText(event.currentTarget.value);
            }}
            className="h-10 w-28 rounded-md border px-3"
            aria-invalid={problem || undefined}
          />
          <span className="text-muted-foreground text-sm">{t.daysUnit}</span>
        </span>
      </label>
      <p className="text-muted-foreground text-sm">{t.current(settings.guestRetentionDays)}</p>
      {problem && (
        <p className="text-destructive text-sm" role="alert">
          {t.daysRange(settings.minDays, settings.maxDays)}
        </p>
      )}
      {shownFailure && (
        <p className="text-destructive text-sm" role="alert">
          {shownFailure.message}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {checking ? t.checking : pending ? t.saving : t.save}
        </Button>
        {saved && !checkFailure && (
          <span className="text-muted-foreground text-sm" role="status">
            {t.saved}
          </span>
        )}
      </div>
    </form>
  );
}
