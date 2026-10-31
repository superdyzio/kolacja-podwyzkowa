import { pluralPl } from "@/lib/guests/summary";
import { TABLE_SHAPE_LABELS } from "@/lib/venue/rules";
import { cn } from "@/lib/utils";
import type { RoomDto, TableDto } from "@/types";

interface Props {
  rooms: RoomDto[];
  tables: TableDto[];
  selectedId: number | null;
  pending: boolean;
  onSelect: (tableId: number) => void;
}

// Tables grouped by room; choosing one opens its edit form (same as clicking its pin).
export function TableList({ rooms, tables, selectedId, pending, onSelect }: Props) {
  if (rooms.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="tables-heading" className="flex flex-col gap-3">
      <h2 id="tables-heading" className="text-lg font-semibold">
        Stoliki
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => {
          const roomTables = tables.filter((table) => table.roomId === room.id);
          const seats = roomTables.reduce((sum, table) => sum + table.seatCount, 0);
          return (
            <div key={room.id} className="flex flex-col gap-2 rounded-xl border p-3">
              <h3 className="font-semibold">
                {room.name}
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  {seats} {pluralPl(seats, "miejsce", "miejsca", "miejsc")}
                </span>
              </h3>
              {roomTables.length === 0 ? (
                <p className="text-muted-foreground text-sm">Brak stolików — kliknij na planie, gdzie stoją.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {roomTables.map((table) => (
                    <li key={table.id}>
                      <button
                        type="button"
                        disabled={pending}
                        aria-pressed={table.id === selectedId}
                        className={cn(
                          "hover:bg-accent focus-visible:ring-ring/50 flex min-h-10 w-full items-center justify-between gap-2 rounded-md border px-3 py-1 text-left text-sm outline-none focus-visible:ring-[3px]",
                          table.id === selectedId && "border-primary bg-primary/10",
                        )}
                        onClick={() => {
                          onSelect(table.id);
                        }}
                      >
                        <span className="truncate font-medium">{table.name}</span>
                        <span className="text-muted-foreground shrink-0 text-xs">
                          {table.seatCount} {pluralPl(table.seatCount, "miejsce", "miejsca", "miejsc")} ·{" "}
                          {TABLE_SHAPE_LABELS[table.shape]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
