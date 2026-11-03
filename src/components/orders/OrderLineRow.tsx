import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/guesses/amount";
import type { Locale } from "@/lib/i18n";
import { orderMessages, servingMessages } from "@/lib/orders/messages";
import { lineTotal, type DishSuggestion } from "@/lib/orders/rules";
import { cn } from "@/lib/utils";
import type { OrderGuestOptionDto, OrderItemDto, OrderTableOptionDto } from "@/types";
import { OrderItemForm, type OrderItemFormValues } from "./OrderItemForm";

interface Props {
  item: OrderItemDto;
  editing: boolean;
  pending: boolean;
  guests: readonly OrderGuestOptionDto[];
  tables: readonly OrderTableOptionDto[];
  dishes: readonly DishSuggestion[];
  locale: Locale;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (values: OrderItemFormValues) => Promise<boolean>;
  // Resolves once the answer has replaced the board.
  onDelivered: (delivered: boolean) => Promise<unknown>;
  onDelete: () => void;
  // serving-highlight: lines with a place on the published plan light it up (null: no place there).
  selected?: boolean;
  onSelect?: (() => void) | null;
}

// One order line on the organizer's page (restaurant-orders): dish × quantity, note, unit price and line total, the
// „Wydane” checkbox, editing in place and deleting; the dish (when it has a place on the plan) lights its place up.
export function OrderLineRow({
  item,
  editing,
  pending,
  guests,
  tables,
  dishes,
  locale,
  onEdit,
  onCancel,
  onSave,
  onDelivered,
  onDelete,
  selected = false,
  onSelect = null,
}: Props) {
  // The box shows the latest tick at once, so a quick second click sends the opposite value; the server's value
  // shows again once every tick of this line has been answered (a failed save then shows what is really stored).
  const [ticked, setTicked] = useState<boolean | null>(null);
  const inFlight = useRef(0);
  const delivered = ticked ?? item.delivered;
  const t = orderMessages(locale);
  const s = servingMessages(locale);

  function tick(value: boolean) {
    setTicked(value);
    inFlight.current += 1;
    void onDelivered(value).finally(() => {
      inFlight.current -= 1;
      if (inFlight.current === 0) {
        setTicked(null);
      }
    });
  }

  if (editing) {
    return (
      <li className="rounded-lg border p-3">
        <OrderItemForm
          item={item}
          guests={guests}
          tables={tables}
          dishes={dishes}
          pending={pending}
          locale={locale}
          submitLabel={t.save}
          onSubmit={onSave}
          onCancel={onCancel}
        />
      </li>
    );
  }
  const name = (
    <>
      <span className={cn("font-medium break-words", delivered && "text-muted-foreground line-through")}>
        {item.name} × {item.quantity}
      </span>
      {item.note && <span className="text-muted-foreground text-sm break-words">{item.note}</span>}
    </>
  );
  return (
    <li className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border p-3", delivered && "bg-muted")}>
      <label className="flex min-h-10 cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={delivered}
          onChange={(event) => {
            tick(event.target.checked);
          }}
          className="size-5 accent-emerald-600"
        />
        <span className="text-sm">{t.delivered}</span>
      </label>
      {onSelect ? (
        <button
          type="button"
          aria-pressed={selected}
          title={s.showLine(item.name)}
          onClick={onSelect}
          className={cn(
            "flex min-h-10 min-w-0 flex-1 basis-48 flex-col items-start rounded-md px-2 py-1 text-left",
            "hover:bg-muted focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
            selected && "bg-red-500/15 ring-2 ring-red-600 hover:bg-red-500/20",
          )}
        >
          {name}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 basis-48 flex-col">{name}</div>
      )}
      <div className="flex flex-col items-end text-right">
        <span className="font-semibold whitespace-nowrap">{formatAmount(lineTotal(item))}</span>
        {item.quantity > 1 && (
          <span className="text-muted-foreground text-xs whitespace-nowrap">
            {item.quantity} × {formatAmount(item.unitPriceGrosze)}
          </span>
        )}
      </div>
      <div className="flex gap-1">
        <Button
          type="button"
          variant="outline"
          className="h-10"
          disabled={pending}
          onClick={onEdit}
          aria-label={t.editLabel(item.name)}
        >
          {t.edit}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="text-destructive h-10"
          disabled={pending}
          onClick={onDelete}
          aria-label={t.removeLabel(item.name)}
        >
          {t.remove}
        </Button>
      </div>
    </li>
  );
}
