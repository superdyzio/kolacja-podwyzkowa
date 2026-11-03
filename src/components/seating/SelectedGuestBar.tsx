import { Pin, PinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { seatingEditorMessages } from "@/lib/seating/messages";

interface Props {
  name: string;
  // „Okno, miejsce 2”, or null for a guest without a seat.
  seatText: string | null;
  absent: boolean;
  pinned: boolean;
  pending: boolean;
  onPin: () => void;
  onUnpin: () => void;
  onUnseat: () => void;
  onCancel: () => void;
  locale: Locale;
}

// The selected guest, pinned to the bottom of the screen: where they sit, pin/unpin, free the seat, cancel.
export function SelectedGuestBar({
  name,
  seatText,
  absent,
  pinned,
  pending,
  onPin,
  onUnpin,
  onUnseat,
  onCancel,
  locale,
}: Props) {
  const t = seatingEditorMessages(locale);
  return (
    <section
      aria-label={t.selectedPerson}
      className="bg-background/95 fixed inset-x-0 bottom-0 z-10 border-t p-3 shadow-lg backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm">
          <strong className="break-words">{name}</strong>
          {absent && <span className="text-muted-foreground">{t.absentSuffix}</span>}
          <span className="text-muted-foreground block text-xs">
            {seatText ?? t.noSeat}
            {pinned && t.pinnedSuffix}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {seatText !== null &&
            (pinned ? (
              <Button type="button" variant="outline" className="h-10" disabled={pending} onClick={onUnpin}>
                <PinOff aria-hidden />
                {t.unpin}
              </Button>
            ) : (
              <Button type="button" variant="outline" className="h-10" disabled={pending} onClick={onPin}>
                <Pin aria-hidden />
                {t.pin}
              </Button>
            ))}
          {seatText !== null && !pinned && (
            <Button type="button" variant="ghost" className="h-10" disabled={pending} onClick={onUnseat}>
              {t.unseat}
            </Button>
          )}
          <Button type="button" variant="ghost" className="h-10" onClick={onCancel}>
            {t.cancel}
          </Button>
        </div>
      </div>
    </section>
  );
}
