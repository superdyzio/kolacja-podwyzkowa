import type { DrinkItemDto, OrderItemDto, PriceKind, PriceListRowDto } from "@/types";
import { compareDishNames, dishKey } from "./rules";

// Prices of an event (client-restaurant-split, FR-027: the client sees prices but never sets them), pure. A price
// belongs to a NAME (any letter case, like the prep list): a new line takes the newest price of its name in the event
// (highest id), else 0 until the venue sets it in „Cennik wydarzenia”, which sets every line of that name at once.

export const PRICE_KINDS = ["dish", "drink"] as const satisfies readonly PriceKind[];

type PricedLine = Pick<OrderItemDto, "id" | "name" | "unitPriceGrosze">;

// The newest line of that name, or null.
function newestLine(lines: readonly PricedLine[], name: string, excludeId: number | null = null): PricedLine | null {
  const key = dishKey(name);
  let newest: PricedLine | null = null;
  for (const line of lines) {
    if (line.id !== excludeId && key !== "" && dishKey(line.name) === key && (!newest || line.id > newest.id)) {
      newest = line;
    }
  }
  return newest;
}

// The price a new line of that name gets: its newest line's, else 0 („Cenę ustali lokal”).
export function newestPriceFor(lines: readonly PricedLine[], name: string, excludeId: number | null = null): number {
  return newestLine(lines, name, excludeId)?.unitPriceGrosze ?? 0;
}

// The price a renamed line gets: unchanged (null) when the name keeps its key (a spelling fix) or the line is not
// there; otherwise the new name's price as for a new line.
export function priceAfterRename(lines: readonly PricedLine[], id: number, name: string): number | null {
  const line = lines.find((candidate) => candidate.id === id);
  if (!line || dishKey(line.name) === dishKey(name)) {
    return null;
  }
  return newestPriceFor(lines, name, id);
}

function rowsOf(kind: PriceKind, lines: readonly PricedLine[]): PriceListRowDto[] {
  const groups = new Map<string, PricedLine[]>();
  for (const line of lines) {
    const key = dishKey(line.name);
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  return [...groups.values()]
    .map((group) => {
      const newest = group.reduce((best, line) => (line.id > best.id ? line : best));
      return {
        kind,
        name: newest.name,
        priceGrosze: newest.unitPriceGrosze,
        mixed: group.some((line) => line.unitPriceGrosze !== newest.unitPriceGrosze),
        lines: group.length,
      };
    })
    .sort((a, b) => compareDishNames(a.name, b.name));
}

// „Cennik wydarzenia”: dishes, then drinks, each in Polish order.
export function priceList(items: readonly PricedLine[], drinks: readonly DrinkItemDto[]): PriceListRowDto[] {
  return [...rowsOf("dish", items), ...rowsOf("drink", drinks)];
}
