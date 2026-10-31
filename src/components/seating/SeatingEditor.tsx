import { useEffect, useMemo, useState } from "react";
import { useOfflineSync } from "@/components/hooks/useOfflineSync";
import { useSeatingBoard } from "@/components/hooks/useSeatingBoard";
import { OfflineFallback } from "@/components/offline/OfflineFallback";
import { Button } from "@/components/ui/button";
import { seatClick, seatingHint, type SeatOccupant, type SelectedGuest } from "@/lib/seating/board";
import { repeatedNeighbours } from "@/lib/seating/neighbours";
import { describeWarnings, seatLabel, seatingWarnings, summarizeSeating } from "@/lib/seating/rules";
import { cn } from "@/lib/utils";
import type { NeighbourHistoryDto, SeatingBoardDto } from "@/types";
import { DrawPanel } from "./DrawPanel";
import { PublishBar } from "./PublishBar";
import { SeatingWarnings } from "./SeatingWarnings";
import { SelectedGuestBar } from "./SelectedGuestBar";
import { TableSeats, type SeatView } from "./TableSeats";
import { UnseatedList } from "./UnseatedList";

interface Props {
  // Organizer API base, e.g. "/api/o/<key>".
  apiBase: string;
  // Organizer panel path, e.g. "/o/<key>" (links to the guest and venue pages).
  panelPath: string;
  initialBoard: SeatingBoardDto;
  initialHistory: NeighbourHistoryDto;
}

const DRAW_CONFIRM = "Losowanie zastąpi nieopublikowane zmiany (przypięci zostają). Kontynuować?";
const RESTORE_CONFIRM = "Przywrócenie zastąpi nieopublikowane zmiany. Kontynuować?";

function seatKey(tableId: number, seat: number): string {
  return `${tableId}:${seat}`;
}

// Organizer seating island (FR-004, FR-007, FR-009, FR-010): draw a draft, choose a person, then a seat; pin, unpin
// and free seats; publish to the TV; discard changes or go back to the previous arrangement. Warnings (split groups,
// absent guests with a seat) never block. A publish also refreshes this device's offline copy of the published seating
// (S-09).
export function SeatingEditor({ apiBase, panelPath, initialBoard, initialHistory }: Props) {
  const {
    board,
    history,
    origin,
    pending,
    drawing,
    failure,
    notice,
    seat,
    unseat,
    setPinned,
    publish,
    draw,
    restore,
    showNotice,
    dismissFailure,
    dismissNotice,
  } = useSeatingBoard(apiBase, initialBoard, initialHistory);
  const { offline, syncNow } = useOfflineSync(apiBase);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { guestList, venue, assignments } = board;

  const guestById = useMemo(() => new Map(guestList.guests.map((guest) => [guest.id, guest])), [guestList.guests]);
  const assignmentByGuest = useMemo(
    () => new Map(assignments.map((assignment) => [assignment.guestId, assignment])),
    [assignments],
  );
  const assignmentBySeat = useMemo(
    () => new Map(assignments.map((assignment) => [seatKey(assignment.tableId, assignment.seat), assignment])),
    [assignments],
  );
  const tableNameById = useMemo(() => new Map(venue.tables.map((table) => [table.id, table.name])), [venue.tables]);
  const partnersById = useMemo(() => {
    const partners = new Map<number, string[]>();
    for (const group of guestList.groups) {
      for (const id of group.memberIds) {
        partners.set(
          id,
          group.memberIds.filter((other) => other !== id).map((other) => guestById.get(other)?.displayName ?? "?"),
        );
      }
    }
    return partners;
  }, [guestList.groups, guestById]);
  const warnings = useMemo(
    () => describeWarnings(seatingWarnings({ guestList, venue, assignments })),
    [guestList, venue, assignments],
  );
  const summary = summarizeSeating({ guestList, venue, assignments });
  const repeats = useMemo(
    () => repeatedNeighbours({ guestList, venue, assignments }, history.pairs),
    [guestList, venue, assignments, history.pairs],
  );
  // Unpublished changes made by hand (or restored) would be lost; an untouched draw would not.
  const replacesManualChanges = !board.upToDate && origin !== "draw";

  // A guest deleted meanwhile (another tab) is no longer selected.
  const selectedGuest = selectedId === null ? null : (guestById.get(selectedId) ?? null);
  const selectedSeat = selectedGuest ? (assignmentByGuest.get(selectedGuest.id) ?? null) : null;
  const selected: SelectedGuest | null = selectedGuest
    ? {
        guestId: selectedGuest.id,
        name: selectedGuest.displayName,
        seated: selectedSeat !== null,
        pinned: selectedSeat?.pinned ?? false,
      }
    : null;

  // Escape clears the selection.
  useEffect(() => {
    if (selectedId === null) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedId]);

  function occupantAt(tableId: number, seatNumber: number): SeatOccupant | null {
    const assignment = assignmentBySeat.get(seatKey(tableId, seatNumber));
    const guest = assignment ? guestById.get(assignment.guestId) : undefined;
    return assignment && guest ? { guestId: guest.id, name: guest.displayName, pinned: assignment.pinned } : null;
  }

  function seatView(tableId: number, seatNumber: number): SeatView {
    const occupant = occupantAt(tableId, seatNumber);
    const click = seatClick(selected, occupant);
    return {
      occupant: occupant && {
        ...occupant,
        absent: guestById.get(occupant.guestId)?.isAbsent ?? false,
        partners: partnersById.get(occupant.guestId) ?? [],
      },
      selected: selected !== null && occupant?.guestId === selected.guestId,
      refusal: selected !== null && click.kind === "refuse" ? click.reason : null,
    };
  }

  async function handleSeatClick(tableId: number, seatNumber: number) {
    const click = seatClick(selected, occupantAt(tableId, seatNumber));
    switch (click.kind) {
      case "select":
        setSelectedId(click.guestId);
        return;
      case "deselect":
        setSelectedId(null);
        return;
      case "refuse":
        showNotice(click.reason);
        return;
      case "seat":
        if (selected && (await seat(selected.guestId, tableId, seatNumber))) {
          setSelectedId(null);
        }
    }
  }

  function toggleSelected(guestId: number) {
    setSelectedId((current) => (current === guestId ? null : guestId));
  }

  function handlePublish() {
    if (
      warnings.length > 0 &&
      !window.confirm(`Opublikować mimo uwag?\n\n${warnings.map((line) => `• ${line}`).join("\n")}`)
    ) {
      return;
    }
    void publish().then((published) => {
      if (published) {
        syncNow();
      }
    });
  }

  function handleDraw() {
    if (replacesManualChanges && !window.confirm(DRAW_CONFIRM)) {
      return;
    }
    setSelectedId(null);
    void draw();
  }

  function handleRestore(snapshotId: number) {
    if (replacesManualChanges && !window.confirm(RESTORE_CONFIRM)) {
      return;
    }
    setSelectedId(null);
    void restore(snapshotId);
  }

  const unseated = guestList.guests
    .filter((guest) => !assignmentByGuest.has(guest.id))
    .map((guest) => ({ id: guest.id, name: guest.displayName, partners: partnersById.get(guest.id) ?? [], guest }));
  const rooms = venue.rooms
    .map((room) => ({ room, tables: venue.tables.filter((table) => table.roomId === room.id) }))
    .filter(({ tables }) => tables.length > 0);

  return (
    <div className={cn("flex flex-col gap-6", selected && "pb-40 sm:pb-28")}>
      <OfflineFallback apiBase={apiBase} offline={offline} />

      <PublishBar
        published={board.published}
        upToDate={board.upToDate}
        summary={summary}
        pending={pending}
        onPublish={handlePublish}
      />

      <DrawPanel
        repeats={repeats}
        snapshotCount={history.snapshotCount}
        published={board.published}
        previous={board.previous}
        upToDate={board.upToDate}
        drawn={origin === "draw"}
        canDraw={venue.tables.length > 0 && guestList.guests.length > 0}
        pending={pending}
        drawing={drawing}
        onDraw={handleDraw}
        onDiscard={() => {
          if (board.published) {
            handleRestore(board.published.snapshotId);
          }
        }}
        onRestorePrevious={() => {
          if (board.previous) {
            handleRestore(board.previous.snapshotId);
          }
        }}
      />

      {failure && (
        <div role="alert" className="border-destructive/50 bg-destructive/5 flex flex-col gap-2 rounded-lg border p-3">
          <p className="text-destructive font-medium">{failure.message}</p>
          {failure.details.length > 0 && (
            <ul className="list-disc pl-5 text-sm">
              {failure.details.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <Button type="button" variant="ghost" className="h-10 self-start" onClick={dismissFailure}>
            Zamknij
          </Button>
        </div>
      )}

      <div aria-live="polite">
        {notice && (
          <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
            <p className="text-sm font-medium">{notice}</p>
            <Button type="button" variant="ghost" className="h-10" onClick={dismissNotice}>
              Zamknij
            </Button>
          </div>
        )}
      </div>

      <SeatingWarnings lines={warnings} />

      {venue.tables.length === 0 && (
        <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
          Nie ma jeszcze stolików.{" "}
          <a href={`${panelPath}/sale`} className="text-foreground underline underline-offset-4">
            Dodaj sale i stoliki
          </a>
          , żeby sadzać gości.
        </p>
      )}
      {guestList.guests.length === 0 && (
        <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
          Lista gości jest pusta.{" "}
          <a href={`${panelPath}/goscie`} className="text-foreground underline underline-offset-4">
            Dodaj gości
          </a>
          , żeby ich posadzić.
        </p>
      )}

      {venue.tables.length > 0 && guestList.guests.length > 0 && (
        <>
          <p className="text-sm" aria-live="polite">
            {seatingHint(selected)}
          </p>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
            <UnseatedList
              present={unseated.filter(({ guest }) => !guest.isAbsent)}
              absent={unseated.filter(({ guest }) => guest.isAbsent)}
              selectedId={selectedId}
              pending={pending}
              onToggle={toggleSelected}
            />
            <div className="flex min-w-0 flex-col gap-6">
              {rooms.map(({ room, tables }) => (
                <section key={room.id} aria-label={room.name} className="flex flex-col gap-3">
                  <h2 className="text-lg font-semibold break-words">{room.name}</h2>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                    {tables.map((table) => (
                      <TableSeats
                        key={table.id}
                        table={table}
                        seatView={(seatNumber) => seatView(table.id, seatNumber)}
                        pending={pending}
                        onSeatClick={(seatNumber) => void handleSeatClick(table.id, seatNumber)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </>
      )}

      {selected && (
        <SelectedGuestBar
          name={selected.name}
          seatText={selectedSeat ? seatLabel(tableNameById.get(selectedSeat.tableId) ?? "?", selectedSeat.seat) : null}
          absent={selectedGuest?.isAbsent ?? false}
          pinned={selected.pinned}
          pending={pending}
          onPin={() => void setPinned(selected.guestId, true)}
          onUnpin={() => void setPinned(selected.guestId, false)}
          onUnseat={() => void unseat(selected.guestId)}
          onCancel={() => {
            setSelectedId(null);
          }}
        />
      )}
    </div>
  );
}
