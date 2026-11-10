import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useBrandingApi } from "@/components/hooks/useBrandingApi";
import type { Locale } from "@/lib/i18n/locale";
import { privacyMessages } from "@/lib/privacy/messages";
import { parseRetentionDays } from "@/lib/privacy/rules";
import type { RetentionSettingsDto } from "@/types";

// „Prywatność danych gości” for the owner (privacy-retention, S-26; FR-040): how many days after an event its guests'
// data is kept. One save at a time (the shared one-action hook); every answer replaces the setting shown.
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

export function RetentionSettingsForm({ initial, locale }: Props) {
  const t = privacyMessages(locale);
  const url = `/api/panel/restaurants/${String(initial.restaurantId)}/retention`;
  const { branding: settings, pending, failure, saved, send } = useBrandingApi(initial, parseSettings, locale);
  const [text, setText] = useState(String(initial.guestRetentionDays));
  const [problem, setProblem] = useState(false);

  return (
    <form
      className="flex flex-col gap-3"
      data-retention-form={settings.guestRetentionDays}
      onSubmit={(event) => {
        event.preventDefault();
        const days = parseRetentionDays(text.trim() === "" ? Number.NaN : Number(text));
        if (!days.ok) {
          setProblem(true);
          return;
        }
        setProblem(false);
        void send(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guestRetentionDays: days.days }),
        });
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
      {failure && (
        <p className="text-destructive text-sm" role="alert">
          {failure.message}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t.saving : t.save}
        </Button>
        {saved && (
          <span className="text-muted-foreground text-sm" role="status">
            {t.saved}
          </span>
        )}
      </div>
    </form>
  );
}
