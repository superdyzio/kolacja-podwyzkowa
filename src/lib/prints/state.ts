import type { PublishedSeatingDto } from "@/types";
import type { PrintKind } from "./options";

// Why a print has no sheets (room-prints, S-24), pure — shown on screen as `data-print-empty="<reason>"`: nothing
// published yet, the guests' data deleted after the retention term (S-26 deletes the snapshots too), nobody seated in
// the published seating (the board, the place cards and the staff list list people) or no tables (the table cards).
export const PRINT_EMPTY_REASONS = ["unpublished", "purged", "nobody", "no-tables"] as const;
export type PrintEmptyReason = (typeof PRINT_EMPTY_REASONS)[number];

export function printEmptyReason(
  kind: PrintKind,
  published: PublishedSeatingDto | null,
  purgedAt: string | null,
): PrintEmptyReason | null {
  if (!published) {
    return purgedAt === null ? "unpublished" : "purged";
  }
  if (kind === "karty-stolow") {
    return published.tables.length === 0 ? "no-tables" : null;
  }
  return published.tables.some((table) => table.seats.length > 0) ? null : "nobody";
}
