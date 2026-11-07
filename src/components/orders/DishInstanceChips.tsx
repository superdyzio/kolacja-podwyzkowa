import type { Locale } from "@/lib/i18n";
import { servingMessages } from "@/lib/orders/messages";
import {
  describePlaceShort,
  isInstanceServed,
  isOnPlan,
  type DishInstances,
  type ServingLine,
} from "@/lib/orders/serving";
import { cn } from "@/lib/utils";

interface Props {
  dish: DishInstances<ServingLine>;
  // The piece lit up now, or null (all of them).
  selected: number | null;
  onSelect: (instance: number) => void;
  locale: Locale;
}

// Every piece of a dish as its own button (serving-highlight): its number and where it goes; picking one lights up
// only its place on the plan, picking it again shows the whole dish. Served pieces are struck through, pieces without
// a place on the plan have a dashed border.
export function DishInstanceChips({ dish, selected, onSelect, locale }: Props) {
  const t = servingMessages(locale);
  return (
    <ul aria-label={t.instancesLabel(dish.name)} className="flex flex-wrap gap-1.5">
      {dish.instances.map((instance) => {
        const pressed = selected === instance.number;
        // guest-delivered: this very piece, not its whole line.
        const served = isInstanceServed(instance);
        return (
          <li key={instance.number}>
            <button
              type="button"
              aria-pressed={pressed}
              onClick={() => {
                onSelect(instance.number);
              }}
              className={cn(
                "flex min-h-10 items-center gap-1.5 rounded-full border px-3 py-1 text-left text-sm",
                "hover:bg-muted focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                !isOnPlan(instance.place) && "border-dashed",
                served && "text-muted-foreground",
                pressed && "border-red-600 bg-red-600 text-white hover:bg-red-700",
              )}
            >
              <span className="font-bold tabular-nums">{instance.number}</span>
              <span className={cn(served && "line-through")}>{describePlaceShort(instance.place, locale)}</span>
              {instance.item.note && (
                <span className={cn("text-xs", pressed ? "text-white/90" : "text-amber-700 dark:text-amber-400")}>
                  {instance.item.note}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
