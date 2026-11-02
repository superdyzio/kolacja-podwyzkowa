import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { VenueDrawing, type VenueDrawingTable } from "@/components/venue-drawing/VenueDrawing";
import {
  STAGE_WIDTH,
  chairPositions,
  chairRadius,
  fromStage,
  pitchUnits,
  rotatePoint,
  stageHeight,
  tableBody,
  tableExtent,
  toStage,
  type StagePoint,
} from "@/lib/venue/drawing";
import {
  OUTLINE_CORNERS,
  cornerPoint,
  moveOutline,
  nudgeTable,
  outlineFromCorners,
  previewSeats,
  resizeOutline,
  rotationTowards,
  stageToFraction,
  type OutlineCorner,
  type TableGeometry,
} from "@/lib/venue/editor";
import type { PinPosition } from "@/lib/venue/pin";
import type { ProposalGhost } from "@/lib/venue-ai/draft";
import { roundFraction, type OutlineFields } from "@/lib/venue/rules";
import type { RoomOutline, SeatOccupantDto, VenueDto } from "@/types";

interface Props {
  imageSrc: string;
  venue: VenueDto;
  // The chair pitch to draw with (the slider's value while it is being moved).
  chairPitch: number;
  occupancy: SeatOccupantDto[];
  selectedTableId: number | null;
  // The room whose outline is drawn or edited („Kontur sali”), or null.
  outlineRoomId: number | null;
  // Where the new table will stand, while its form is open.
  draftPin: PinPosition | null;
  // „Podgląd jak na TV”: the drawing as the TV will show it, without the photo, read-only.
  preview: boolean;
  // The kept lines of an AI layout proposal, drawn dashed over the plan.
  ghost?: ProposalGhost | null;
  label: string;
  onPlanClick: (position: PinPosition) => void;
  onTableClick: (tableId: number) => void;
  // Each resolves to true when saved; a failed save drops the local change, so the last saved geometry shows.
  saveTable: (tableId: number, geometry: TableGeometry) => Promise<boolean>;
  saveOutline: (roomId: number, outline: RoomOutline) => Promise<boolean>;
}

// Without the plan image (or until it has loaded) the drawing stands on a 16:9 stage.
const BLANK_ASPECT = 16 / 9;
// A pointer that moved less than this (CSS px) between press and release clicked.
const CLICK_SLOP = 4;
// Arrow / bracket keys save after this pause, so holding a key sends one request.
const KEY_SAVE_DELAY_MS = 500;

type Gesture =
  | { kind: "table"; tableId: number; start: StagePoint; origin: TableGeometry }
  | { kind: "rotate"; tableId: number; centre: StagePoint; origin: TableGeometry }
  | { kind: "plan"; start: StagePoint }
  | { kind: "draw-room"; roomId: number; start: StagePoint }
  | { kind: "move-room"; roomId: number; start: StagePoint; origin: OutlineFields }
  | { kind: "resize-room"; roomId: number; corner: OutlineCorner; origin: OutlineFields };

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

// A pointer position → stage units, through the SVG's own transform (viewBox, scaling, page scroll).
function stagePoint(svg: SVGSVGElement, clientX: number, clientY: number): StagePoint | null {
  const matrix = svg.getScreenCTM();
  if (!matrix) {
    return null;
  }
  const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  return { x: point.x, y: point.y };
}

// The organizer's drawing editor (venue-drawing): the plan photo, faded, under the venue drawn exactly like on the
// TV. Drag a table to move it, drag its round handle to turn it (15° steps, Shift = free), arrows and [ ] move and
// turn the selected one; in outline mode drag a rectangle for the room, then move it by its edge or resize it by a
// corner. Changes show at once and are saved on release (keys: after a short pause).
export function DrawingCanvas({
  imageSrc,
  venue,
  chairPitch,
  occupancy,
  selectedTableId,
  outlineRoomId,
  draftPin,
  preview,
  ghost = null,
  label,
  onPlanClick,
  onTableClick,
  saveTable,
  saveOutline,
}: Props) {
  const [aspect, setAspect] = useState(BLANK_ASPECT);
  const [broken, setBroken] = useState(false);
  // Local geometry not saved yet (dragged, turned, nudged); dropped once its save answers.
  const [tableDrafts, setTableDrafts] = useState<ReadonlyMap<number, TableGeometry>>(new Map());
  const [outlineDraft, setOutlineDraft] = useState<{ roomId: number; outline: OutlineFields } | null>(null);
  const pitch = pitchUnits(chairPitch);

  function geometryOf(tableId: number): TableGeometry | null {
    const draft = tableDrafts.get(tableId);
    if (draft) {
      return draft;
    }
    const table = venue.tables.find((candidate) => candidate.id === tableId);
    return table ? { x: table.x, y: table.y, rotation: table.rotation } : null;
  }

  function setTableDraft(tableId: number, geometry: TableGeometry) {
    setTableDrafts((current) => new Map(current).set(tableId, geometry));
  }

  async function commitTable(tableId: number, geometry: TableGeometry) {
    await saveTable(tableId, geometry);
    // Saved → the venue has it now; failed → the venue still has the last saved one. A newer draft stays.
    setTableDrafts((current) => {
      if (current.get(tableId) !== geometry) {
        return current;
      }
      const next = new Map(current);
      next.delete(tableId);
      return next;
    });
  }

  async function commitOutline(roomId: number, outline: OutlineFields) {
    await saveOutline(roomId, outline);
    setOutlineDraft((current) => (current?.outline === outline ? null : current));
  }

  // The key listener lives as long as the selection; it reads the table's geometry of the LATEST render (after a
  // drag or a saved nudge), never the one from when it was attached.
  const liveGeometry = useRef(geometryOf);
  useEffect(() => {
    liveGeometry.current = geometryOf;
  });

  // A key nudge waiting for its pause before the save. Any gesture saves it first, so a drag that starts within the
  // pause is saved after it and never overwritten by it.
  const pendingNudge = useRef<{
    tableId: number;
    geometry: TableGeometry;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  function flushNudge() {
    const nudge = pendingNudge.current;
    if (nudge) {
      pendingNudge.current = null;
      clearTimeout(nudge.timer);
      void commitTable(nudge.tableId, nudge.geometry);
    }
  }

  // Keys on the selected table: arrows move it, [ ] turn it; saved after a pause.
  useEffect(() => {
    if (selectedTableId === null || preview) {
      return;
    }
    const tableId = selectedTableId;
    function onKeyDown(event: KeyboardEvent) {
      if (isTyping(event.target) || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const waiting = pendingNudge.current?.tableId === tableId ? pendingNudge.current : null;
      const current = waiting?.geometry ?? liveGeometry.current(tableId);
      const next = current ? nudgeTable(current, event.key, event.shiftKey) : null;
      if (!next) {
        return;
      }
      event.preventDefault();
      setTableDraft(tableId, next);
      clearTimeout(waiting?.timer);
      pendingNudge.current = {
        tableId,
        geometry: next,
        timer: setTimeout(() => {
          pendingNudge.current = null;
          void commitTable(tableId, next);
        }, KEY_SAVE_DELAY_MS),
      };
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      // Leaving the table (or the page) with a pending nudge saves it now rather than dropping it.
      flushNudge();
    };
    // Rebuilt only when the selection changes; a held key keeps its running geometry in `pendingNudge`. commitTable
    // only calls the save prop and functional state updates, so an older copy of it behaves the same.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTableId, preview]);

  // One gesture at a time, followed on the window so it keeps going outside the drawing.
  function startGesture(event: ReactPointerEvent<SVGElement>, gesture: Gesture) {
    const svg = event.currentTarget.ownerSVGElement ?? (event.currentTarget as SVGSVGElement);
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    flushNudge();
    const pressX = event.clientX;
    const pressY = event.clientY;
    let moved = false;
    let last: { point: StagePoint; shift: boolean } | null = null;

    function apply(point: StagePoint, shift: boolean) {
      switch (gesture.kind) {
        case "table": {
          const from = fromStage(gesture.start, aspect);
          const to = fromStage(point, aspect);
          setTableDraft(gesture.tableId, {
            ...gesture.origin,
            x: roundFraction(gesture.origin.x + to.x - from.x),
            y: roundFraction(gesture.origin.y + to.y - from.y),
          });
          break;
        }
        case "rotate":
          setTableDraft(gesture.tableId, {
            ...gesture.origin,
            rotation: rotationTowards(gesture.centre, point, shift),
          });
          break;
        case "draw-room": {
          const outline = outlineFromCorners(fromStage(gesture.start, aspect), fromStage(point, aspect));
          setOutlineDraft(outline ? { roomId: gesture.roomId, outline } : null);
          break;
        }
        case "move-room": {
          const from = fromStage(gesture.start, aspect);
          const to = fromStage(point, aspect);
          setOutlineDraft({
            roomId: gesture.roomId,
            outline: moveOutline(gesture.origin, to.x - from.x, to.y - from.y),
          });
          break;
        }
        case "resize-room":
          setOutlineDraft({
            roomId: gesture.roomId,
            outline: resizeOutline(gesture.origin, gesture.corner, fromStage(point, aspect)),
          });
          break;
        case "plan":
          break;
      }
    }

    function onMove(move: PointerEvent) {
      if (!moved && Math.hypot(move.clientX - pressX, move.clientY - pressY) < CLICK_SLOP) {
        return;
      }
      moved = true;
      const point = stagePoint(svg, move.clientX, move.clientY);
      if (point) {
        last = { point, shift: move.shiftKey };
        apply(point, move.shiftKey);
      }
    }

    function finish(up: PointerEvent, cancelled: boolean) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      if (cancelled) {
        // The browser took the pointer (e.g. a touch became a page scroll): forget only this gesture's change.
        if ((gesture.kind === "table" || gesture.kind === "rotate") && moved) {
          const tableId = gesture.tableId;
          setTableDrafts((current) => {
            const next = new Map(current);
            next.delete(tableId);
            return next;
          });
        } else if (gesture.kind !== "plan" && moved) {
          setOutlineDraft(null);
        }
        return;
      }
      if (!moved) {
        if (gesture.kind === "table") {
          onTableClick(gesture.tableId);
        } else if (gesture.kind === "plan") {
          const point = stagePoint(svg, up.clientX, up.clientY);
          if (point) {
            onPlanClick(stageToFraction(point, aspect));
          }
        }
        return;
      }
      if (!last) {
        return;
      }
      // Recompute from the last position (state updates of this gesture may not have rendered yet).
      const point = last.point;
      switch (gesture.kind) {
        case "table": {
          const from = fromStage(gesture.start, aspect);
          const to = fromStage(point, aspect);
          const geometry = {
            ...gesture.origin,
            x: roundFraction(gesture.origin.x + to.x - from.x),
            y: roundFraction(gesture.origin.y + to.y - from.y),
          };
          setTableDraft(gesture.tableId, geometry);
          void commitTable(gesture.tableId, geometry);
          break;
        }
        case "rotate": {
          const geometry = { ...gesture.origin, rotation: rotationTowards(gesture.centre, point, last.shift) };
          setTableDraft(gesture.tableId, geometry);
          void commitTable(gesture.tableId, geometry);
          break;
        }
        case "draw-room": {
          const outline = outlineFromCorners(fromStage(gesture.start, aspect), fromStage(point, aspect));
          if (outline) {
            setOutlineDraft({ roomId: gesture.roomId, outline });
            void commitOutline(gesture.roomId, outline);
          } else {
            setOutlineDraft(null);
          }
          break;
        }
        case "move-room":
        case "resize-room": {
          const from = gesture.kind === "move-room" ? fromStage(gesture.start, aspect) : null;
          const to = fromStage(point, aspect);
          const outline =
            gesture.kind === "move-room" && from
              ? moveOutline(gesture.origin, to.x - from.x, to.y - from.y)
              : gesture.kind === "resize-room"
                ? resizeOutline(gesture.origin, gesture.corner, to)
                : null;
          if (outline) {
            setOutlineDraft({ roomId: gesture.roomId, outline });
            void commitOutline(gesture.roomId, outline);
          }
          break;
        }
        case "plan":
          break;
      }
    }
    function onUp(up: PointerEvent) {
      finish(up, false);
    }
    function onCancel(cancel: PointerEvent) {
      finish(cancel, true);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  // The image may finish loading before the page is interactive (no onLoad then): read it when it mounts, too.
  function readNatural(img: HTMLImageElement | null) {
    if (img?.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      const ratio = img.naturalWidth / img.naturalHeight;
      setAspect((previous) => (previous === ratio ? previous : ratio));
    }
  }

  const previewNames = useMemo(
    () => (preview ? previewSeats(venue.tables, occupancy) : null),
    [preview, venue.tables, occupancy],
  );

  const tables = venue.tables.map((table): VenueDrawingTable => {
    const geometry = tableDrafts.get(table.id) ?? table;
    return {
      key: String(table.id),
      name: table.name,
      shape: table.shape,
      seatCount: table.seatCount,
      x: geometry.x,
      y: geometry.y,
      rotation: geometry.rotation,
      seats: previewNames?.get(table.id) ?? [],
    };
  });

  const rooms = venue.rooms.flatMap((room) => {
    const outline = outlineDraft?.roomId === room.id ? outlineDraft.outline : room.outline;
    return outline ? [{ name: room.name, ...outline }] : [];
  });

  const height = stageHeight(aspect);
  const handleRadius = STAGE_WIDTH * 0.009;
  const stroke = STAGE_WIDTH * 0.0015;

  // The rotate handle of the selected table: beyond its chairs, in the direction of its top.
  const selected = selectedTableId === null ? null : venue.tables.find((table) => table.id === selectedTableId);
  const selectedGeometry = selected ? geometryOf(selected.id) : null;
  let rotateHandle: { centre: StagePoint; handle: StagePoint } | null = null;
  if (selected && selectedGeometry) {
    const centre = toStage(selectedGeometry.x, selectedGeometry.y, aspect);
    const extent = tableExtent({ ...selected, ...selectedGeometry }, chairPitch, aspect);
    const reach =
      Math.max(extent.right - centre.x, centre.x - extent.left, extent.bottom - centre.y, centre.y - extent.top) +
      pitch * 0.6;
    const offset = rotatePoint(0, -reach, selectedGeometry.rotation);
    rotateHandle = { centre, handle: { x: centre.x + offset.x, y: centre.y + offset.y } };
  }

  const outlineRoom = outlineRoomId === null ? null : venue.rooms.find((room) => room.id === outlineRoomId);
  const editedOutline =
    outlineRoom && outlineDraft?.roomId === outlineRoom.id ? outlineDraft.outline : (outlineRoom?.outline ?? null);

  if (broken) {
    return (
      <p role="alert" className="text-destructive rounded-lg border p-4 text-sm">
        Nie udało się wczytać planu. Odśwież stronę albo wgraj plan ponownie.
      </p>
    );
  }

  const image = (
    <img
      ref={readNatural}
      src={imageSrc}
      alt=""
      aria-hidden
      className="hidden"
      onLoad={(event) => {
        readNatural(event.currentTarget);
      }}
      onError={() => {
        setBroken(true);
      }}
    />
  );

  if (preview) {
    return (
      <div className="overflow-hidden rounded-md bg-neutral-950 text-white">
        {image}
        <VenueDrawing
          aspect={aspect}
          chairPitch={chairPitch}
          rooms={rooms}
          tables={tables}
          variant="tv"
          label="Podgląd planu sali tak, jak pokaże go TV"
          className="h-auto max-h-[80vh] w-full"
        />
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-white">
      {image}
      <VenueDrawing
        aspect={aspect}
        chairPitch={chairPitch}
        rooms={rooms}
        tables={tables}
        variant="editor"
        showStage
        selectedTable={selectedTableId === null ? null : String(selectedTableId)}
        onTablePointerDown={(key, event) => {
          const tableId = Number(key);
          const origin = geometryOf(tableId);
          const svg = event.currentTarget.ownerSVGElement;
          const point = svg ? stagePoint(svg, event.clientX, event.clientY) : null;
          if (origin && point) {
            startGesture(event, { kind: "table", tableId, start: point, origin });
          }
        }}
        label={label}
        className="h-auto max-h-[80vh] w-full"
        background={
          <>
            <image
              href={imageSrc}
              x={0}
              y={0}
              width={STAGE_WIDTH}
              height={height}
              preserveAspectRatio="none"
              opacity={0.4}
            />
            <rect
              x={0}
              y={0}
              width={STAGE_WIDTH}
              height={height}
              fill="transparent"
              strokeWidth={stroke}
              className={
                outlineRoom ? "cursor-crosshair touch-none stroke-sky-700/40" : "cursor-crosshair stroke-neutral-300"
              }
              onPointerDown={(event) => {
                const svg = event.currentTarget.ownerSVGElement;
                const point = svg ? stagePoint(svg, event.clientX, event.clientY) : null;
                if (point) {
                  startGesture(
                    event,
                    outlineRoom
                      ? { kind: "draw-room", roomId: outlineRoom.id, start: point }
                      : { kind: "plan", start: point },
                  );
                }
              }}
            />
          </>
        }
      >
        {ghost && (
          <g className="pointer-events-none" strokeDasharray={`${pitch * 0.25} ${pitch * 0.15}`}>
            {ghost.rooms.map((outline, index) => (
              <rect
                key={`room-${String(index)}`}
                x={outline.x * STAGE_WIDTH}
                y={outline.y * height}
                width={outline.width * STAGE_WIDTH}
                height={outline.height * height}
                fill="none"
                strokeWidth={stroke * 2}
                className="stroke-amber-600"
              />
            ))}
            {ghost.tables.map((table, index) => {
              const body = tableBody(table, chairPitch, aspect);
              return (
                <g
                  key={`table-${String(index)}`}
                  className="fill-amber-400/20 stroke-amber-600"
                  strokeWidth={stroke * 2}
                >
                  {body.shape === "round" ? (
                    <circle cx={body.cx} cy={body.cy} r={body.r} />
                  ) : (
                    <rect
                      x={body.cx - body.length / 2}
                      y={body.cy - body.depth / 2}
                      width={body.length}
                      height={body.depth}
                      transform={`rotate(${String(body.rotation)} ${String(body.cx)} ${String(body.cy)})`}
                    />
                  )}
                  {chairPositions(table, chairPitch, aspect).map((chair) => (
                    <circle key={chair.seat} cx={chair.x} cy={chair.y} r={chairRadius(chairPitch)} />
                  ))}
                </g>
              );
            })}
          </g>
        )}
        {draftPin && (
          <g className="pointer-events-none">
            <circle
              cx={draftPin.x * STAGE_WIDTH}
              cy={draftPin.y * height}
              r={pitch * 1.2}
              strokeWidth={stroke * 2}
              strokeDasharray={`${pitch * 0.3} ${pitch * 0.2}`}
              className="fill-sky-500/15 stroke-sky-700"
            />
            <text
              x={draftPin.x * STAGE_WIDTH}
              y={draftPin.y * height}
              fontSize={pitch * 0.45}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-sky-900 font-semibold"
            >
              Nowy stolik
            </text>
          </g>
        )}
        {rotateHandle && selected && selectedGeometry && (
          <g>
            <line
              x1={rotateHandle.centre.x}
              y1={rotateHandle.centre.y}
              x2={rotateHandle.handle.x}
              y2={rotateHandle.handle.y}
              strokeWidth={stroke}
              className="pointer-events-none stroke-sky-600"
            />
            <circle
              cx={rotateHandle.handle.x}
              cy={rotateHandle.handle.y}
              r={handleRadius}
              strokeWidth={stroke}
              className="cursor-alias touch-none fill-white stroke-sky-600"
              onPointerDown={(event) => {
                startGesture(event, {
                  kind: "rotate",
                  tableId: selected.id,
                  centre: rotateHandle.centre,
                  origin: selectedGeometry,
                });
              }}
            >
              <title>Obróć stolik (Shift: bez skoku co 15°)</title>
            </circle>
          </g>
        )}
        {outlineRoom && editedOutline && (
          <g>
            <rect
              x={editedOutline.x * STAGE_WIDTH}
              y={editedOutline.y * height}
              width={editedOutline.width * STAGE_WIDTH}
              height={editedOutline.height * height}
              fill="none"
              pointerEvents="stroke"
              strokeWidth={handleRadius * 1.6}
              className="cursor-move touch-none stroke-sky-600/30"
              onPointerDown={(event) => {
                const svg = event.currentTarget.ownerSVGElement;
                const point = svg ? stagePoint(svg, event.clientX, event.clientY) : null;
                if (point) {
                  startGesture(event, {
                    kind: "move-room",
                    roomId: outlineRoom.id,
                    start: point,
                    origin: editedOutline,
                  });
                }
              }}
            >
              <title>Przesuń kontur sali</title>
            </rect>
            {OUTLINE_CORNERS.map((corner) => {
              const point = cornerPoint(editedOutline, corner);
              return (
                <rect
                  key={corner}
                  x={point.x * STAGE_WIDTH - handleRadius}
                  y={point.y * height - handleRadius}
                  width={handleRadius * 2}
                  height={handleRadius * 2}
                  strokeWidth={stroke}
                  className={
                    corner === "nw" || corner === "se"
                      ? "cursor-nwse-resize touch-none fill-white stroke-sky-700"
                      : "cursor-nesw-resize touch-none fill-white stroke-sky-700"
                  }
                  onPointerDown={(event) => {
                    startGesture(event, { kind: "resize-room", roomId: outlineRoom.id, corner, origin: editedOutline });
                  }}
                >
                  <title>Zmień rozmiar sali</title>
                </rect>
              );
            })}
          </g>
        )}
      </VenueDrawing>
    </div>
  );
}
