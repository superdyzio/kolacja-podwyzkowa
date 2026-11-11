import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { tvRoomMessages } from "@/lib/tv-rooms/messages";
import { tvRoomPath } from "@/lib/tv-rooms/pin";
import { compareTableNames } from "@/lib/venue/rules";

interface Props {
  // The event's TV link, absolute (built from the request origin).
  tvUrl: string;
  // The venue's room names (any order).
  rooms: readonly string[];
  locale: Locale;
}

// The per-room TV links (tv-room-rotation, S-20; FR-034): one read-only address per room with „Kopiuj” (selects the
// field where the clipboard is unavailable: plain-http LAN addresses) and „Otwórz”. Nothing while the venue has no
// rooms. The parameter is a public view filter on the same TV key: no new secret.
export function TvRoomLinks({ tvUrl, rooms, locale }: Props) {
  const t = tvRoomMessages(locale);
  const id = useId();
  const [status, setStatus] = useState<{ room: string; text: string } | null>(null);
  const sorted = [...rooms].sort(compareTableNames);
  if (sorted.length === 0) {
    return null;
  }

  async function copy(room: string, url: string, field: HTMLInputElement | null) {
    const clipboard = navigator.clipboard as Clipboard | undefined;
    try {
      if (!clipboard) {
        throw new Error("no clipboard");
      }
      await clipboard.writeText(url);
      setStatus({ room, text: t.copied });
    } catch {
      field?.select();
      setStatus({ room, text: t.copySelected });
    }
  }

  return (
    <details className="flex flex-col gap-2" data-tv-room-links>
      <summary className="cursor-pointer font-medium">{t.linksHeading}</summary>
      <p className="text-muted-foreground mt-2 text-sm">{t.linksHint}</p>
      <ul className="mt-2 flex flex-col gap-3">
        {sorted.map((room, index) => {
          const url = tvRoomPath(tvUrl, room);
          const fieldId = `${id}-${String(index)}`;
          return (
            <li key={room} className="flex flex-col gap-1" data-tv-room-link={room}>
              <label htmlFor={fieldId} className="text-sm font-medium">
                {room}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id={fieldId}
                  type="text"
                  readOnly
                  value={url}
                  onFocus={(event) => {
                    event.currentTarget.select();
                  }}
                  className="bg-muted min-w-0 flex-1 rounded-md border px-3 py-2 font-mono text-sm"
                />
                <Button
                  type="button"
                  className="h-10"
                  aria-label={t.copyLabel(room)}
                  onClick={(event) => {
                    const field = event.currentTarget.parentElement?.querySelector("input") ?? null;
                    void copy(room, url, field);
                  }}
                >
                  {t.copy}
                </Button>
                <Button variant="outline" className="h-10" asChild>
                  <a href={url} target="_blank" rel="noreferrer" aria-label={t.openLabel(room)}>
                    {t.open}
                  </a>
                </Button>
              </div>
              {status?.room === room && (
                <p role="status" className="text-muted-foreground text-sm">
                  {status.text}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
