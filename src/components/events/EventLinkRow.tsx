import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { EventCardStatus } from "@/components/hooks/useEventCard";
import { eventPanelMessages } from "@/lib/events/messages";
import type { EventLinkKind } from "@/lib/events/rules";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  kind: EventLinkKind;
  // "/o/<key>", "/tv/<key>" or "/r/<key>".
  path: string;
  // This request's origin: links are built from it (https behind the Lambda proxy).
  origin: string;
  eventName: string;
  disabled: boolean;
  // The last answer of this link's „Wymień link”, if any.
  status: EventCardStatus | null;
  onRotate: () => void;
  locale: Locale;
}

// One link of the event card (restaurant-events, S-11): the address in a read-only field, „Kopiuj” (selects the field
// where the clipboard is unavailable: plain-http LAN addresses), „Otwórz” in a new tab and „Wymień link” — asks first,
// naming who the old link cuts off (FR-025).
export function EventLinkRow({ kind, path, origin, eventName, disabled, status, onRotate, locale }: Props) {
  const t = eventPanelMessages(locale);
  const texts = t.links[kind];
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const url = new URL(path, origin).href;

  async function copy() {
    const clipboard = navigator.clipboard as Clipboard | undefined;
    try {
      if (!clipboard) {
        throw new Error("no clipboard");
      }
      await clipboard.writeText(url);
      setCopyStatus(t.copied);
    } catch {
      field.current?.select();
      setCopyStatus(t.copySelected);
    }
  }

  function rotate() {
    if (window.confirm(texts.confirmRotate(eventName))) {
      setCopyStatus(null);
      onRotate();
    }
  }

  return (
    <li className="flex flex-col gap-2" data-link={kind}>
      <label htmlFor={`${id}-url`} className="font-medium">
        {texts.label}
      </label>
      <p className="text-muted-foreground text-sm">{texts.hint}</p>
      <input
        id={`${id}-url`}
        ref={field}
        type="text"
        readOnly
        value={url}
        onFocus={(event) => {
          event.currentTarget.select();
        }}
        className="bg-muted w-full rounded-md border px-3 py-2 font-mono text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-10" aria-label={t.copyLabel(texts.label)} onClick={() => void copy()}>
          {t.copy}
        </Button>
        <Button variant="outline" className="h-10" asChild>
          <a href={url} target="_blank" rel="noreferrer" aria-label={t.openLabel(texts.label)}>
            {t.open}
          </a>
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-10"
          disabled={disabled}
          aria-label={t.rotateLabel(texts.label)}
          onClick={rotate}
        >
          {t.rotate}
        </Button>
      </div>
      {status && (
        <p role={status.error ? "alert" : "status"} className={cn("text-sm", status.error && "text-destructive")}>
          {status.text}
        </p>
      )}
      {copyStatus && (
        <p role="status" className="text-sm">
          {copyStatus}
        </p>
      )}
    </li>
  );
}
