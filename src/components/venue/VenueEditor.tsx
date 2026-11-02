import { useEffect, useMemo, useRef, useState } from "react";
import { isBoard } from "@/components/hooks/useSeatingBoard";
import { useVenue } from "@/components/hooks/useVenue";
import { Button } from "@/components/ui/button";
import {
  describeRemovedOccupants,
  occupancyAfter,
  occupancyOf,
  occupantsRemovedBy,
  type VenueSeatChange,
} from "@/lib/seating/published";
import type { TableGeometry } from "@/lib/venue/editor";
import { planImagePath, type PinPosition } from "@/lib/venue/pin";
import { MAX_CHAIR_PITCH_SLIDER, MIN_CHAIR_PITCH_SLIDER, formatChairPitch } from "@/lib/venue/editor";
import { nextTableName } from "@/lib/venue/rules";
import { formatVenueSummary, summarizeVenue } from "@/lib/venue/summary";
import type { RoomOutline, SeatOccupantDto, VenueDto } from "@/types";
import { DrawingCanvas } from "./DrawingCanvas";
import { PlanUpload } from "./PlanUpload";
import { RoomOutlinePanel } from "./RoomOutlinePanel";
import { RoomsSection } from "./RoomsSection";
import { TableForm, type TableFormValues } from "./TableForm";
import { TableList } from "./TableList";

interface Props {
  // Organizer API base, e.g. "/api/o/<key>".
  apiBase: string;
  initialVenue: VenueDto;
  // Who sits where in the working seating arrangement (structure edits that remove seats name them first).
  initialOccupancy: SeatOccupantDto[];
}

// What a click on the plan does: idle → open "Nowy stolik" at that point; new → move the draft pin;
// edit → (tables/list switch the table; dragging moves any table); move → put the edited table there;
// outline → a drag draws the room's outline.
type Mode =
  | { kind: "idle" }
  | { kind: "new"; position: PinPosition }
  | { kind: "edit"; tableId: number }
  | { kind: "move"; tableId: number }
  | { kind: "outline"; roomId: number };

// The chair-scale slider saves after this pause.
const PITCH_SAVE_DELAY_MS = 400;

const NO_ROOM_MESSAGE = "Najpierw dodaj salę — każdy stolik stoi w jakiejś sali.";

// Organizer rooms-and-tables island (FR-005, FR-006): plan upload, rooms, tables pinned on the plan.
export function VenueEditor({ apiBase, initialVenue, initialOccupancy }: Props) {
  const { venue, pending, failure, send, uploadPlan, showFailure, dismissFailure } = useVenue(apiBase, initialVenue);
  const [occupancy, setOccupancy] = useState(initialOccupancy);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [lastRoomId, setLastRoomId] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);
  // The slider's value until its save answers.
  const [pitchDraft, setPitchDraft] = useState<number | null>(null);
  const pitchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const panelRef = useRef<HTMLDivElement>(null);

  const roomNameById = useMemo(() => new Map(venue.rooms.map((room) => [room.id, room.name])), [venue.rooms]);
  const tableNameById = useMemo(() => new Map(venue.tables.map((table) => [table.id, table.name])), [venue.tables]);
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
  const outlineRoom = mode.kind === "outline" ? (venue.rooms.find((room) => room.id === mode.roomId) ?? null) : null;
  const current: Mode =
    ((mode.kind === "edit" || mode.kind === "move") && !activeTable) ||
    (mode.kind === "new" && venue.rooms.length === 0) ||
    (mode.kind === "outline" && (!outlineRoom || venue.plan === null))
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

  // The arrangement may have changed in another tab (/rozsadzenie): re-read who sits where whenever the page comes
  // back into view, so the seat-loss confirmations name the right people. A failed read keeps what is known.
  useEffect(() => {
    async function refreshOccupancy() {
      if (document.hidden) {
        return;
      }
      try {
        const board: unknown = await fetch(`${apiBase}/seating`).then((response) => response.json());
        if (isBoard(board)) {
          setOccupancy(occupancyOf(board));
        }
      } catch {
        // Offline or the key revoked: the next return to the page tries again.
      }
    }
    function onVisibilityChange() {
      void refreshOccupancy();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [apiBase]);

  // On narrow screens the form sits under the plan: bring it into view when it opens.
  const formKey =
    current.kind === "edit"
      ? `edit-${current.tableId}`
      : current.kind === "outline"
        ? `outline-${current.roomId}`
        : current.kind;
  useEffect(() => {
    if (formKey !== "idle") {
      panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [formKey]);

  // „\n\nMiejsce stracą: …” for a confirm question, or "" when nobody sits on the removed seats.
  function seatLoss(change: VenueSeatChange): string {
    const text = describeRemovedOccupants(occupantsRemovedBy(occupancy, change), tableNameById);
    return text === "" ? "" : `\n\n${text}`;
  }

  // The DB unseats the same guests (cascade, seat-count trigger); the page follows without a reload.
  function forgetSeats(change: VenueSeatChange) {
    setOccupancy((current) => occupancyAfter(current, change));
  }

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
    let saved = false;
    if (current.kind === "new") {
      saved = await send({ method: "POST", path: "/tables", body: values });
    } else if (current.kind === "edit") {
      // A lower seat count unseats whoever sits above it: ask first, naming them (nobody there → no question).
      const change: VenueSeatChange = { kind: "seat-count", tableId: current.tableId, seatCount: values.seatCount };
      const loss = seatLoss(change);
      if (
        loss !== "" &&
        !window.confirm(`Zmniejszyć liczbę miejsc przy „${activeTable?.name ?? ""}” do ${values.seatCount}?${loss}`)
      ) {
        return false;
      }
      saved = await send({ method: "PATCH", path: `/tables/${current.tableId}`, body: values });
      if (saved) {
        forgetSeats(change);
      }
    }
    if (saved) {
      setLastRoomId(values.roomId);
      setMode({ kind: "idle" });
    }
    return saved;
  }

  async function deleteActiveTable() {
    if (!activeTable) {
      return;
    }
    const change: VenueSeatChange = { kind: "delete-table", tableId: activeTable.id };
    if (!window.confirm(`Usunąć stolik „${activeTable.name}”?${seatLoss(change)}`)) {
      return;
    }
    if (await send({ method: "DELETE", path: `/tables/${activeTable.id}` })) {
      forgetSeats(change);
      setMode({ kind: "idle" });
    }
  }

  function roomChange(roomId: number): VenueSeatChange {
    return {
      kind: "delete-room",
      tableIds: venue.tables.filter((table) => table.roomId === roomId).map((table) => table.id),
    };
  }

  async function deleteRoom(roomId: number) {
    const change = roomChange(roomId);
    if (await send({ method: "DELETE", path: `/rooms/${roomId}` })) {
      forgetSeats(change);
    }
  }

  function selectTable(tableId: number) {
    setMode({ kind: "edit", tableId });
  }

  // Geometry edits on the plan never touch seating (S-02 contract): no seat-loss question.
  function saveGeometry(tableId: number, geometry: TableGeometry): Promise<boolean> {
    return send({ method: "PATCH", path: `/tables/${tableId}`, body: geometry });
  }

  function saveOutline(roomId: number, outline: RoomOutline | null): Promise<boolean> {
    return send({ method: "PATCH", path: `/rooms/${roomId}`, body: { outline } });
  }

  function changePitch(pitch: number) {
    setPitchDraft(pitch);
    clearTimeout(pitchTimer.current);
    pitchTimer.current = setTimeout(() => {
      void send({ method: "PATCH", path: "/venue", body: { chairPitch: pitch } }).then(() => {
        setPitchDraft((draft) => (draft === pitch ? null : draft));
      });
    }, PITCH_SAVE_DELAY_MS);
  }

  useEffect(
    () => () => {
      clearTimeout(pitchTimer.current);
    },
    [],
  );

  function addTableInCentre() {
    if (venue.rooms.length === 0) {
      showFailure(NO_ROOM_MESSAGE);
      return;
    }
    setPreview(false);
    setMode({ kind: "new", position: { x: 0.5, y: 0.5 } });
  }

  const chairPitch = pitchDraft ?? venue.chairPitch;

  const hint =
    venue.rooms.length === 0
      ? "Najpierw dodaj salę, potem klikaj na planie, gdzie stoją stoliki."
      : preview
        ? "Tak TV pokaże plan po publikacji (imiona z bieżącego rozsadzenia). Wyłącz podgląd, żeby dalej rysować."
        : current.kind === "outline" && outlineRoom
          ? `Przeciągnij na planie prostokąt sali „${outlineRoom.name}”. Esc — koniec.`
          : current.kind === "new"
            ? "Uzupełnij dane nowego stolika. Kliknięcie w inne miejsce planu przesuwa pinezkę."
            : current.kind === "move" && activeTable
              ? `Kliknij na planie nowe miejsce stolika „${activeTable.name}”. Esc — anuluj.`
              : current.kind === "edit" && activeTable
                ? `Edytujesz stolik „${activeTable.name}”. Kliknięcie w puste miejsce planu dodaje nowy stolik.`
                : "Kliknij na planie, gdzie stoi nowy stolik, albo kliknij stolik, żeby go edytować. Stoliki przeciągasz myszą; strzałki przesuwają, a [ i ] obracają wybrany.";

  const surfaceLabel =
    current.kind === "move" && activeTable
      ? `Plan lokalu: kliknij, żeby przestawić stolik „${activeTable.name}”`
      : "Plan lokalu: kliknij, żeby postawić nowy stolik; przeciągnij stolik, żeby go przesunąć";

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
          onOutline={
            venue.plan
              ? (roomId) => {
                  setPreview(false);
                  setMode({ kind: "outline", roomId });
                }
              : undefined
          }
          seatLoss={(roomId) => seatLoss(roomChange(roomId))}
          onDelete={(roomId) => void deleteRoom(roomId)}
        />
      </div>

      <section aria-labelledby="plan-heading" className="flex flex-col gap-3">
        <h2 id="plan-heading" className="text-lg font-semibold">
          Stoliki na planie
        </h2>
        {venue.plan && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" className="h-10" disabled={pending} onClick={addTableInCentre}>
                Nowy stolik
              </Button>
              <Button
                type="button"
                variant={preview ? "default" : "outline"}
                className="h-10"
                aria-pressed={preview}
                onClick={() => {
                  setPreview((value) => !value);
                }}
              >
                Podgląd jak na TV
              </Button>
              <label className="flex items-center gap-2 text-sm">
                <span className="font-medium">Skala krzeseł</span>
                <input
                  type="range"
                  min={MIN_CHAIR_PITCH_SLIDER}
                  max={MAX_CHAIR_PITCH_SLIDER}
                  step={0.001}
                  value={chairPitch}
                  onChange={(event) => {
                    changePitch(Number(event.target.value));
                  }}
                  className="accent-primary w-36"
                />
                <span className="text-muted-foreground w-12 tabular-nums">{formatChairPitch(chairPitch)}</span>
              </label>
            </div>
            <p className="text-sm" aria-live="polite">
              {hint}
            </p>
          </>
        )}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          {venue.plan ? (
            <DrawingCanvas
              // A new upload (new version → new URL) remounts the canvas, clearing an earlier load error.
              key={venue.plan.version}
              imageSrc={planImagePath(apiBase, venue.plan.version)}
              venue={venue}
              chairPitch={chairPitch}
              occupancy={occupancy}
              selectedTableId={activeTable?.id ?? null}
              outlineRoomId={current.kind === "outline" ? current.roomId : null}
              draftPin={current.kind === "new" ? current.position : null}
              preview={preview}
              disabled={pending}
              label={surfaceLabel}
              onPlanClick={(position) => void handlePlanClick(position)}
              onTableClick={selectTable}
              saveTable={saveGeometry}
              saveOutline={saveOutline}
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
                geometry={{ ...current.position, rotation: 0 }}
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
                geometry={activeTable}
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
            {current.kind === "outline" && outlineRoom && (
              <RoomOutlinePanel
                key={`outline-${outlineRoom.id}`}
                room={outlineRoom}
                pending={pending}
                onSave={(outline) => saveOutline(outlineRoom.id, outline)}
                onDone={() => {
                  setMode({ kind: "idle" });
                }}
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
