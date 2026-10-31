import { Pin, PinOff } from "lucide-react";
import { Button } from "@/components/ui/button";

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
}: Props) {
  return (
    <section
      aria-label="Wybrana osoba"
      className="bg-background/95 fixed inset-x-0 bottom-0 z-10 border-t p-3 shadow-lg backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm">
          <strong className="break-words">{name}</strong>
          {absent && <span className="text-muted-foreground"> (nieobecny)</span>}
          <span className="text-muted-foreground block text-xs">
            {seatText ?? "bez miejsca"}
            {pinned && " · przypięty"}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {seatText !== null &&
            (pinned ? (
              <Button type="button" variant="outline" className="h-10" disabled={pending} onClick={onUnpin}>
                <PinOff aria-hidden />
                Odepnij
              </Button>
            ) : (
              <Button type="button" variant="outline" className="h-10" disabled={pending} onClick={onPin}>
                <Pin aria-hidden />
                Przypnij do tego miejsca
              </Button>
            ))}
          {seatText !== null && !pinned && (
            <Button type="button" variant="ghost" className="h-10" disabled={pending} onClick={onUnseat}>
              Zwolnij miejsce
            </Button>
          )}
          <Button type="button" variant="ghost" className="h-10" onClick={onCancel}>
            Anuluj
          </Button>
        </div>
      </div>
    </section>
  );
}
