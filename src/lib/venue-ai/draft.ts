import { formatUsd } from "@/lib/ai-topics/cost";
import { pluralPl } from "@/lib/guests/summary";
import type { DrawnTable } from "@/lib/venue/drawing";
import { formatChairPitch } from "@/lib/venue/editor";
import { MAX_SEATS, MIN_SEATS } from "@/lib/venue/rules";
import type {
  LayoutNewTableDto,
  LayoutTableUpdateDto,
  RoomOutline,
  TableDto,
  VenueLayoutProposalAnswerDto,
} from "@/types";

// The organizer's review of a layout proposal (venue-drawing), pure: which lines are kept, the edits of the new tables,
// the texts of the lines, the ghost drawn on the plan and the body sent to POST /venue/layout.

export interface NewTableEdit {
  name: string;
  roomId: number;
  seatCount: number;
}

export interface ProposalSelection {
  // Line keys: "u<tableId>", "n<index>", "r<roomId>", "pitch". Every line starts kept.
  dropped: ReadonlySet<string>;
  edits: ReadonlyMap<number, NewTableEdit>;
}

export const EMPTY_SELECTION: ProposalSelection = { dropped: new Set(), edits: new Map() };

export function updateKey(update: LayoutTableUpdateDto): string {
  return `u${String(update.tableId)}`;
}

export function newTableKey(index: number): string {
  return `n${String(index)}`;
}

export function roomKey(roomId: number): string {
  return `r${String(roomId)}`;
}

export const PITCH_KEY = "pitch";

export function toggleLine(selection: ProposalSelection, key: string): ProposalSelection {
  const dropped = new Set(selection.dropped);
  if (!dropped.delete(key)) {
    dropped.add(key);
  }
  return { ...selection, dropped };
}

export function editNewTable(selection: ProposalSelection, index: number, edit: NewTableEdit): ProposalSelection {
  return { ...selection, edits: new Map(selection.edits).set(index, edit) };
}

export function newTableValues(table: LayoutNewTableDto, index: number, selection: ProposalSelection): NewTableEdit {
  return selection.edits.get(index) ?? { name: table.name, roomId: table.roomId, seatCount: table.seatCount };
}

export function pitchChanged(answer: VenueLayoutProposalAnswerDto): boolean {
  return Math.abs(answer.proposal.chairPitch - answer.proposal.previousChairPitch) > 1e-9;
}

// „Stolik 3: przesunięty, obrót 90°”.
export function describeUpdate(update: LayoutTableUpdateDto): string {
  const parts: string[] = [];
  if (Math.hypot(update.x - update.previous.x, update.y - update.previous.y) > 0.002) {
    parts.push("przesunięty");
  }
  if (update.rotation !== update.previous.rotation) {
    parts.push(`obrót ${String(update.rotation)}°`);
  }
  return `${update.name}: ${parts.join(", ")}`;
}

export function describeSeats(count: number): string {
  return `${String(count)} ${pluralPl(count, "miejsce", "miejsca", "miejsc")}`;
}

export function describeRoomOutline(name: string, previous: RoomOutline | null): string {
  return `${name}: ${previous ? "nowy kontur" : "kontur"}`;
}

export function describePitch(answer: VenueLayoutProposalAnswerDto): string {
  const { chairPitch, previousChairPitch } = answer.proposal;
  return `Skala krzeseł: ${formatChairPitch(previousChairPitch)} → ${formatChairPitch(chairPitch)}`;
}

export function describeCost(costNanoUsd: number | null): string {
  return costNanoUsd === null ? "Koszt odczytu nieznany." : `Koszt odczytu: ≈ ${formatUsd(costNanoUsd)}.`;
}

export function isValidEdit(edit: NewTableEdit): boolean {
  return (
    edit.name.trim() !== "" &&
    Number.isInteger(edit.seatCount) &&
    edit.seatCount >= MIN_SEATS &&
    edit.seatCount <= MAX_SEATS
  );
}

export interface ApplyLayoutBody {
  tables: { id: number; x: number; y: number; rotation: number }[];
  newTables: LayoutNewTableDto[];
  rooms: { id: number; outline: RoomOutline | null }[];
  chairPitch: number | null;
}

// What „Zastosuj zaznaczone” sends: only the kept lines, new tables with their edits.
export function applyBody(answer: VenueLayoutProposalAnswerDto, selection: ProposalSelection): ApplyLayoutBody {
  const { proposal } = answer;
  const kept = (key: string) => !selection.dropped.has(key);
  return {
    tables: proposal.updates
      .filter((update) => kept(updateKey(update)))
      .map((update) => ({ id: update.tableId, x: update.x, y: update.y, rotation: update.rotation })),
    newTables: proposal.newTables.flatMap((table, index) =>
      kept(newTableKey(index)) ? [{ ...table, ...newTableValues(table, index, selection) }] : [],
    ),
    rooms: proposal.rooms
      .filter((room) => kept(roomKey(room.roomId)))
      .map((room) => ({ id: room.roomId, outline: room.outline })),
    chairPitch: pitchChanged(answer) && kept(PITCH_KEY) ? proposal.chairPitch : null,
  };
}

export function isEmptyBody(body: ApplyLayoutBody): boolean {
  return body.tables.length === 0 && body.newTables.length === 0 && body.rooms.length === 0 && body.chairPitch === null;
}

export interface ProposalGhost {
  tables: DrawnTable[];
  rooms: RoomOutline[];
}

// The kept lines drawn over the plan: moved tables where they would stand, new tables, the room outlines.
export function proposalGhost(
  answer: VenueLayoutProposalAnswerDto,
  selection: ProposalSelection,
  tables: readonly TableDto[],
): ProposalGhost {
  const body = applyBody(answer, selection);
  const byId = new Map(tables.map((table) => [table.id, table]));
  return {
    tables: [
      ...body.tables.flatMap((moved) => {
        const table = byId.get(moved.id);
        return table
          ? [{ shape: table.shape, seatCount: table.seatCount, x: moved.x, y: moved.y, rotation: moved.rotation }]
          : [];
      }),
      ...body.newTables.map((table) => ({
        shape: table.shape,
        seatCount: Math.min(MAX_SEATS, Math.max(MIN_SEATS, table.seatCount)),
        x: table.x,
        y: table.y,
        rotation: table.rotation,
      })),
    ],
    rooms: body.rooms.flatMap((room) => (room.outline ? [room.outline] : [])),
  };
}
