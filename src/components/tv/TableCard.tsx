import type { Ref } from "react";
import { tableCardColumns } from "@/lib/seating/published";
import type { TvTableDto } from "@/types";

interface Props {
  table: TvTableDto;
  ref?: Ref<HTMLDivElement>;
}

// A table on the TV: its name and the seated names in seat order (a rectangular table: its two sides side by side),
// readable from across the room — 3vh text, long names wrap within ~30vh. Positioned by the parent (starts hidden
// until placed).
export function TableCard({ table, ref }: Props) {
  const columns = tableCardColumns(table);
  return (
    <div
      ref={ref}
      className="invisible absolute top-0 left-0 rounded-[1vh] bg-neutral-900/85 px-[1.2vh] py-[0.8vh] text-white shadow-lg ring-1 ring-white/20"
    >
      <h2 className="max-w-[60vh] text-[3vh] leading-tight font-bold break-words">{table.name}</h2>
      {columns.length > 0 && (
        <div className="flex gap-[2vh]">
          {columns.map((column) => (
            <ol key={column[0].seat} className="flex max-w-[30vh] flex-col">
              {column.map((seat) => (
                <li key={seat.seat} className="flex items-baseline gap-[0.6vh] text-[3vh] leading-tight">
                  <span className="w-[2.6vh] shrink-0 text-right text-[1.6vh] text-neutral-400 tabular-nums">
                    {seat.seat}
                  </span>
                  <span className="min-w-0 break-words">{seat.name}</span>
                </li>
              ))}
            </ol>
          ))}
        </div>
      )}
    </div>
  );
}
