import { cn } from "@/lib/utils";
import { GuestMarkers } from "./GuestMarkers";

export interface UnseatedGuest {
  id: number;
  name: string;
  partners: string[];
}

interface Props {
  // Present guests without a seat, then absent ones (both alphabetical).
  present: UnseatedGuest[];
  absent: UnseatedGuest[];
  selectedId: number | null;
  pending: boolean;
  onToggle: (guestId: number) => void;
}

// „Bez miejsca”: the guests still to seat; clicking one selects it (again — clears the selection).
export function UnseatedList({ present, absent, selectedId, pending, onToggle }: Props) {
  return (
    <section
      aria-labelledby="unseated-heading"
      className="flex flex-col gap-3 rounded-xl border p-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
    >
      <h2 id="unseated-heading" className="text-lg font-semibold">
        Bez miejsca <span className="text-muted-foreground text-sm font-normal">({present.length})</span>
      </h2>
      {present.length === 0 ? (
        <p className="text-muted-foreground text-sm">Wszyscy obecni mają miejsce.</p>
      ) : (
        <GuestButtons guests={present} selectedId={selectedId} pending={pending} onToggle={onToggle} />
      )}
      {absent.length > 0 && (
        <>
          <h3 className="text-muted-foreground text-sm font-medium">Nieobecni ({absent.length})</h3>
          <GuestButtons guests={absent} muted selectedId={selectedId} pending={pending} onToggle={onToggle} />
        </>
      )}
    </section>
  );
}

function GuestButtons({
  guests,
  muted = false,
  selectedId,
  pending,
  onToggle,
}: {
  guests: UnseatedGuest[];
  muted?: boolean;
  selectedId: number | null;
  pending: boolean;
  onToggle: (guestId: number) => void;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {guests.map((guest) => (
        <li key={guest.id}>
          <button
            type="button"
            disabled={pending}
            aria-pressed={guest.id === selectedId}
            onClick={() => {
              onToggle(guest.id);
            }}
            className={cn(
              "hover:bg-accent focus-visible:ring-ring/50 flex min-h-10 w-full flex-col items-start justify-center gap-0.5 rounded-md border px-3 py-1.5 text-left text-sm outline-none focus-visible:ring-[3px] disabled:opacity-60",
              muted && "text-muted-foreground",
              guest.id === selectedId && "border-primary bg-primary/10 ring-primary ring-1",
            )}
          >
            <span className="font-medium break-words">{guest.name}</span>
            <GuestMarkers partners={guest.partners} />
          </button>
        </li>
      ))}
    </ul>
  );
}
