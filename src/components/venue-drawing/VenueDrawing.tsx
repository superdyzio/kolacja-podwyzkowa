import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  DEFAULT_FONTS,
  LINE_HEIGHT,
  STAGE_WIDTH,
  chairRadius,
  estimateTextWidth,
  layoutDrawing,
  padRect,
  pitchUnits,
  roomRect,
  stageHeight,
  unionRect,
  viewBoxOf,
  type DrawingTableInput,
  type LaidOutTable,
  type StageRect,
} from "@/lib/venue/drawing";
import type { RoomOutline } from "@/types";

// The venue drawn in one style (venue-drawing): room outlines with their names, every table with its chairs, and the
// seated names horizontal at their chairs. One component for the TV, the guest's phone and the organizer's editor;
// the geometry is src/lib/venue/drawing.ts (stage units: STAGE_WIDTH wide, the plan image's aspect ratio).

export type DrawingVariant = "tv" | "phone" | "editor";

export interface DrawingRoom extends RoomOutline {
  name: string;
}

export interface VenueDrawingTable extends DrawingTableInput {
  // Unique per drawing (React key, editor selection).
  key: string;
  // Phone: tables other than the guest's are drawn faded.
  muted?: boolean;
}

interface Props {
  aspect: number;
  chairPitch: number;
  rooms: readonly DrawingRoom[];
  tables: readonly VenueDrawingTable[];
  variant: DrawingVariant;
  // The guest's own chair (phone).
  highlight?: { table: string; seat: number } | null;
  // Crop the view to this table (by key) instead of the whole venue.
  focus?: string | null;
  // Editor: the whole stage stays in view (tables may be dragged anywhere on it).
  showStage?: boolean;
  selectedTable?: string | null;
  onTablePointerDown?: (key: string, event: PointerEvent<SVGGElement>) => void;
  // Extra SVG in stage units, drawn on top (editor handles).
  children?: ReactNode;
  // Rendered under everything else, in stage units (editor: the plan photo).
  background?: ReactNode;
  // Already in the page's language (the drawing itself has no text of its own, only names).
  label: string;
  // Optional (i18n): only marks the language of the label on the <svg>; callers may leave it out.
  locale?: Locale;
  className?: string;
}

const STYLES: Record<
  DrawingVariant,
  {
    room: string;
    roomName: string;
    body: string;
    tableName: string;
    occupied: string;
    empty: string;
    name: string;
  }
> = {
  tv: {
    room: "fill-neutral-900 stroke-neutral-600",
    roomName: "fill-neutral-400",
    body: "fill-neutral-800 stroke-neutral-500",
    tableName: "fill-neutral-400",
    occupied: "fill-amber-400",
    empty: "fill-none stroke-neutral-600",
    name: "fill-white",
  },
  phone: {
    room: "fill-muted/50 stroke-border",
    roomName: "fill-muted-foreground",
    body: "fill-muted stroke-muted-foreground/40",
    tableName: "fill-muted-foreground",
    occupied: "fill-amber-500",
    empty: "fill-background stroke-muted-foreground/50",
    name: "fill-foreground",
  },
  editor: {
    room: "fill-sky-500/5 stroke-sky-700/70",
    roomName: "fill-sky-900",
    body: "fill-white/90 stroke-neutral-700",
    tableName: "fill-neutral-700",
    occupied: "fill-amber-500",
    empty: "fill-white stroke-neutral-500",
    name: "fill-neutral-900",
  },
};

const MEASURE_FONT = 100;

// Text widths per font unit of the given names, measured in the drawing's own font once mounted (an estimate before
// that and on the server).
function useMeasuredWidths(names: readonly string[]) {
  const measureRef = useRef<SVGGElement>(null);
  const [widths, setWidths] = useState<ReadonlyMap<string, number>>(new Map());
  // Bumped once the page's web fonts have loaded: text measured in a fallback font is narrower.
  const [fontsReady, setFontsReady] = useState(0);
  const key = names.join("\n");

  useEffect(() => {
    let active = true;
    void document.fonts.ready.then(() => {
      if (active) {
        setFontsReady((count) => count + 1);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useLayoutEffect(() => {
    const group = measureRef.current;
    if (!group) {
      return;
    }
    const measured = new Map<string, number>();
    for (const element of group.querySelectorAll<SVGTextElement>("text[data-name]")) {
      const length = element.getComputedTextLength();
      if (length > 0) {
        measured.set(element.dataset.name ?? "", length / MEASURE_FONT);
      }
    }
    setWidths((previous) => {
      const same = previous.size === measured.size && [...measured].every(([name, w]) => previous.get(name) === w);
      return same ? previous : measured;
    });
  }, [key, fontsReady]);

  return { measureRef, widths };
}

export function VenueDrawing({
  aspect,
  chairPitch,
  rooms,
  tables,
  variant,
  highlight = null,
  focus = null,
  showStage = false,
  selectedTable = null,
  onTablePointerDown,
  children,
  background,
  label,
  locale,
  className,
}: Props) {
  const styles = STYLES[variant];
  const pitch = pitchUnits(chairPitch);
  const names = useMemo(
    () => [...new Set(tables.flatMap((table) => table.seats.map((seat) => seat.name)))].sort(),
    [tables],
  );
  const { measureRef, widths } = useMeasuredWidths(names);

  const laidOut = useMemo(() => {
    const measure = (name: string) => widths.get(name) ?? estimateTextWidth(name);
    return layoutDrawing(tables, chairPitch, aspect, measure, DEFAULT_FONTS);
  }, [tables, chairPitch, aspect, widths]);

  const roomRects = useMemo(() => rooms.map((room) => roomRect(room, aspect)), [rooms, aspect]);
  const view = useMemo(() => {
    const stage: StageRect = { left: 0, top: 0, right: STAGE_WIDTH, bottom: stageHeight(aspect) };
    const focusIndex = focus === null ? -1 : tables.findIndex((table) => table.key === focus);
    if (focusIndex >= 0) {
      return padRect(laidOut[focusIndex].bounds, pitch * 0.8);
    }
    const content = unionRect([...laidOut.map((table) => table.bounds), ...roomRects, ...(showStage ? [stage] : [])]);
    return padRect(content ?? stage, pitch * 0.6);
  }, [focus, tables, laidOut, roomRects, showStage, aspect, pitch]);

  const stroke = Math.max(0.5, pitch * 0.05);

  return (
    <svg
      viewBox={viewBoxOf(view)}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
      lang={locale}
      className={cn("block select-none", className)}
    >
      {background}
      {rooms.map((room, index) => {
        const rect = roomRects[index];
        return (
          // Rooms never take the pointer: in the editor a click on a room is a click on the plan under it.
          <g key={`room-${room.name}`} className="pointer-events-none">
            <rect
              x={rect.left}
              y={rect.top}
              width={rect.right - rect.left}
              height={rect.bottom - rect.top}
              rx={pitch * 0.3}
              strokeWidth={stroke}
              className={styles.room}
            />
            <text
              x={rect.left + pitch * 0.35}
              y={rect.top + pitch * 0.3}
              fontSize={pitch * 0.5}
              dominantBaseline="hanging"
              className={cn(styles.roomName, "font-semibold")}
            >
              {room.name}
            </text>
          </g>
        );
      })}
      {tables.map((table, index) => (
        <DrawnTable
          key={table.key}
          table={table}
          laidOut={laidOut[index]}
          styles={styles}
          stroke={stroke}
          chairR={chairRadius(chairPitch)}
          highlightSeat={highlight?.table === table.name ? highlight.seat : null}
          selected={selectedTable === table.key}
          onPointerDown={onTablePointerDown}
        />
      ))}
      {children}
      <g ref={measureRef} visibility="hidden" aria-hidden>
        {names.map((name) => (
          <text key={name} data-name={name} fontSize={MEASURE_FONT} x={0} y={0} className="font-semibold">
            {name}
          </text>
        ))}
      </g>
    </svg>
  );
}

interface DrawnTableProps {
  table: VenueDrawingTable;
  laidOut: LaidOutTable;
  styles: (typeof STYLES)[DrawingVariant];
  stroke: number;
  chairR: number;
  highlightSeat: number | null;
  selected: boolean;
  onPointerDown?: (key: string, event: PointerEvent<SVGGElement>) => void;
}

function DrawnTable({
  table,
  laidOut,
  styles,
  stroke,
  chairR,
  highlightSeat,
  selected,
  onPointerDown,
}: DrawnTableProps) {
  const { body } = laidOut;
  return (
    <g
      className={cn(table.muted && "opacity-40", onPointerDown && "cursor-grab touch-none")}
      onPointerDown={
        onPointerDown
          ? (event) => {
              onPointerDown(table.key, event);
            }
          : undefined
      }
      data-table={table.key}
    >
      {body.shape === "round" ? (
        <circle
          cx={body.cx}
          cy={body.cy}
          r={body.r}
          strokeWidth={selected ? stroke * 3 : stroke}
          className={cn(styles.body, selected && "stroke-sky-600")}
        />
      ) : (
        <rect
          x={body.cx - body.length / 2}
          y={body.cy - body.depth / 2}
          width={body.length}
          height={body.depth}
          rx={body.depth * 0.12}
          transform={`rotate(${body.rotation} ${body.cx} ${body.cy})`}
          strokeWidth={selected ? stroke * 3 : stroke}
          className={cn(styles.body, selected && "stroke-sky-600")}
        />
      )}
      <text
        x={body.cx}
        y={body.cy}
        fontSize={laidOut.nameFont}
        textAnchor="middle"
        dominantBaseline="central"
        className={cn(styles.tableName, "font-medium")}
      >
        {table.name}
      </text>
      {laidOut.chairs.map((chair) => {
        const occupied = laidOut.occupied.has(chair.seat);
        const mine = chair.seat === highlightSeat;
        return mine ? (
          <g key={chair.seat}>
            <circle cx={chair.x} cy={chair.y} r={chairR * 1.9} className="fill-red-500/25" />
            <circle
              cx={chair.x}
              cy={chair.y}
              r={chairR * 1.25}
              strokeWidth={stroke * 1.5}
              className="fill-red-600 stroke-white"
            />
          </g>
        ) : (
          <circle
            key={chair.seat}
            cx={chair.x}
            cy={chair.y}
            r={chairR}
            strokeWidth={stroke}
            className={occupied ? styles.occupied : styles.empty}
          />
        );
      })}
      {laidOut.labels.map((placed) => {
        const mine = placed.seat === highlightSeat;
        return (
          <text
            key={placed.seat}
            x={placed.box.cx}
            y={placed.box.cy}
            fontSize={placed.box.height / LINE_HEIGHT}
            textAnchor="middle"
            dominantBaseline="central"
            className={mine ? "fill-red-700 font-bold" : cn(styles.name, "font-semibold")}
          >
            {placed.name}
          </text>
        );
      })}
    </g>
  );
}
