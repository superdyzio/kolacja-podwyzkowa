import { useEffect, useMemo, useRef, useState } from "react";
import { useVenue } from "@/components/hooks/useVenue";
import { Button } from "@/components/ui/button";
import { planImagePath, type PinPosition } from "@/lib/venue/pin";
import { nextTableName } from "@/lib/venue/rules";
import { formatVenueSummary, summarizeVenue } from "@/lib/venue/summary";
import type { VenueDto } from "@/types";
import { PlanCanvas } from "./PlanCanvas";
import { PlanUpload } from "./PlanUpload";
import { RoomsSection } from "./RoomsSection";
import { TableForm, type TableFormValues } from "./TableForm";
import { TableList } from "./TableList";

interface Props {
  // Organizer API base, e.g. "/api/o/<key>".
  apiBase: string;
  initialVenue: VenueDto;
}

// What a click on the plan does: idle → open "Nowy stolik" at that point; new → move the draft pin;
// edit → (pins/list switch the table); move → put the edited table's pin there.
type Mode =
  | { kind: "idle" }
  | { kind: "new"; position: PinPosition }
  | { kind: "edit"; tableId: number }
  | { kind: "move"; tableId: number };

const NO_ROOM_MESSAGE = "Najpierw dodaj salę — każdy stolik stoi w jakiejś sali.";

// Organizer rooms-and-tables island (FR-005, FR-006): plan upload, rooms, tables pinned on the plan.
export function VenueEditor({ apiBase, initialVenue }: Props) {
  const { venue, pending, failure, send, uploadPlan, showFailure, dismissFailure } = useVenue(apiBase, initialVenue);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [lastRoomId, setLastRoomId] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const roomNameById = useMemo(() => new Map(venue.rooms.map((room) => [room.id, room.name])), [venue.rooms]);
  const tableCountByRoom = useMemo(() => {
    const counts = new Map<number, number>();
    for (const table of venue.tables) {
      counts.set(table.roomId, (counts.get(table.roomId) ?? 0) + 1);
    }
    return counts;
  }, [venue.tables]);

  // A table that disappeared (deleted, or its room deleted) ends its edit/move mode; so does losing every room.
  const activeTable =
    mode.kind === "edit" || mode.kind === "move"
      ? (venue.tables.find((table) => table.id === mode.tableId) ?? null)
      : null;
  const current: Mode =
    ((mode.kind === "edit" || mode.kind === "move") && !activeTable) ||
    (mode.kind === "new" && venue.rooms.length === 0)
      ? { kind: "idle" }
      : mode;

  const defaultRoomId = lastRoomId !== null && roomNameById.has(lastRoomId) ? lastRoomId : (venue.rooms[0]?.id ?? 0);
  const summary = formatVenueSummary(summarizeVenue(venue));

  // Escape leaves any mode.
  useEffect(() => {
    if (current.kind === "idle") {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMode({ kind: "idle" });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [current.kind]);

  // On narrow screens the form sits under the plan: bring it into view when it opens.
  const formKey = current.kind === "edit" ? `edit-${current.tableId}` : current.kind;
  useEffect(() => {
    if (formKey !== "idle") {
      panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [formKey]);

  async function handlePlanClick(position: PinPosition) {
    if (current.kind === "move") {
      if (await send({ method: "PATCH", path: `/tables/${current.tableId}`, body: position })) {
        setMode({ kind: "edit", tableId: current.tableId });
      }
      return;
    }
    if (venue.rooms.length === 0) {
      showFailure(NO_ROOM_MESSAGE);
      return;
    }
    setMode({ kind: "new", position });
  }

  async function saveTable(values: TableFormValues): Promise<boolean> {
    const saved =
      current.kind === "new"
        ? await send({ method: "POST", path: "/tables", body: { ...values, ...current.position } })
        : current.kind === "edit"
          ? await send({ method: "PATCH", path: `/tables/${current.tableId}`, body: values })
          : false;
    if (saved) {
      setLastRoomId(values.roomId);
      setMode({ kind: "idle" });
    }
    return saved;
  }

  async function deleteActiveTable() {
    if (!activeTable || !window.confirm(`Usunąć stolik „${activeTable.name}”?`)) {
      return;
    }
    if (await send({ method: "DELETE", path: `/tables/${activeTable.id}` })) {
      setMode({ kind: "idle" });
    }
  }

  function selectTable(tableId: number) {
    setMode({ kind: "edit", tableId });
  }

  const hint =
    venue.rooms.length === 0
      ? "Najpierw dodaj salę, potem klikaj na planie, gdzie stoją stoliki."
      : current.kind === "new"
        ? "Uzupełnij dane nowego stolika. Kliknięcie w inne miejsce planu przesuwa pinezkę."
        : current.kind === "move" && activeTable
          ? `Kliknij na planie nowe miejsce stolika „${activeTable.name}”. Esc — anuluj.`
          : current.kind === "edit" && activeTable
            ? `Edytujesz stolik „${activeTable.name}”. Kliknięcie w puste miejsce planu dodaje nowy stolik.`
            : "Kliknij na planie, gdzie stoi nowy stolik, albo kliknij pinezkę, żeby go edytować.";

  const surfaceLabel =
    current.kind === "move" && activeTable
      ? `Plan lokalu: kliknij, żeby przestawić stolik „${activeTable.name}”`
      : "Plan lokalu: kliknij, żeby postawić nowy stolik";

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground" aria-live="polite">
        {summary}
      </p>

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

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <PlanUpload
          hasPlan={venue.plan !== null}
          hasTables={venue.tables.length > 0}
          pending={pending}
          onUpload={uploadPlan}
        />
        <RoomsSection
          rooms={venue.rooms}
          tableCountByRoom={tableCountByRoom}
          pending={pending}
          onAdd={(name) => send({ method: "POST", path: "/rooms", body: { name } })}
          onRename={(roomId, name) => send({ method: "PATCH", path: `/rooms/${roomId}`, body: { name } })}
          onDelete={(roomId) => void send({ method: "DELETE", path: `/rooms/${roomId}` })}
        />
      </div>

      <section aria-labelledby="plan-heading" className="flex flex-col gap-3">
        <h2 id="plan-heading" className="text-lg font-semibold">
          Stoliki na planie
        </h2>
        {venue.plan && (
          <p className="text-sm" aria-live="polite">
            {hint}
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          {venue.plan ? (
            <PlanCanvas
              imageSrc={planImagePath(apiBase, venue.plan.version)}
              tables={venue.tables}
              roomNameById={roomNameById}
              selectedId={activeTable?.id ?? null}
              draftPin={current.kind === "new" ? current.position : null}
              surfaceLabel={surfaceLabel}
              disabled={pending}
              onPlanClick={(position) => void handlePlanClick(position)}
              onPinClick={selectTable}
            />
          ) : (
            <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
              Wgraj plan lokalu, żeby postawić na nim stoliki.
            </p>
          )}

          <div ref={panelRef} className="lg:sticky lg:top-4">
            {current.kind === "new" && (
              <TableForm
                key="new"
                table={null}
                rooms={venue.rooms}
                defaultRoomId={defaultRoomId}
                suggestedName={nextTableName(venue.tables.map((table) => table.name))}
                pending={pending}
                onSubmit={saveTable}
                onCancel={() => {
                  setMode({ kind: "idle" });
                }}
              />
            )}
            {current.kind === "edit" && activeTable && (
              <TableForm
                key={`edit-${activeTable.id}`}
                table={activeTable}
                rooms={venue.rooms}
                defaultRoomId={activeTable.roomId}
                suggestedName={activeTable.name}
                pending={pending}
                onSubmit={saveTable}
                onCancel={() => {
                  setMode({ kind: "idle" });
                }}
                onMove={() => {
                  setMode({ kind: "move", tableId: activeTable.id });
                }}
                onDelete={() => void deleteActiveTable()}
              />
            )}
            {current.kind === "move" && activeTable && (
              <div className="flex flex-col gap-3 rounded-xl border p-4">
                <p className="text-sm">
                  Kliknij na planie nowe miejsce stolika <strong>„{activeTable.name}”</strong>.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 self-start"
                  onClick={() => {
                    setMode({ kind: "edit", tableId: activeTable.id });
                  }}
                >
                  Anuluj
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>

      <TableList
        rooms={venue.rooms}
        tables={venue.tables}
        selectedId={activeTable?.id ?? null}
        pending={pending}
        onSelect={selectTable}
      />
    </div>
  );
}
