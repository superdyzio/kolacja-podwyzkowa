import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/guesses/amount";
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
  onEdit: () => void;
  onCancel: () => void;
  onSave: (values: OrderItemFormValues) => Promise<boolean>;
  onDelivered: (delivered: boolean) => void;
  onDelete: () => void;
}

// One order line on the organizer's page (restaurant-orders): dish × quantity, note, unit price and line total, the
// „Wydane” checkbox, editing in place and deleting.
export function OrderLineRow({
  item,
  editing,
  pending,
  guests,
  tables,
  dishes,
  onEdit,
  onCancel,
  onSave,
  onDelivered,
  onDelete,
}: Props) {
  if (editing) {
    return (
      <li className="rounded-lg border p-3">
        <OrderItemForm
          item={item}
          guests={guests}
          tables={tables}
          dishes={dishes}
          pending={pending}
          submitLabel="Zapisz"
          onSubmit={onSave}
          onCancel={onCancel}
        />
      </li>
    );
  }
  return (
    <li
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border p-3", item.delivered && "bg-muted")}
    >
      <label className="flex min-h-10 cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={item.delivered}
          onChange={(event) => {
            onDelivered(event.target.checked);
          }}
          className="size-5 accent-emerald-600"
        />
        <span className="text-sm">Wydane</span>
      </label>
      <div className="flex min-w-0 flex-1 basis-48 flex-col">
        <span className={cn("font-medium break-words", item.delivered && "text-muted-foreground line-through")}>
          {item.name} × {item.quantity}
        </span>
        {item.note && <span className="text-muted-foreground text-sm break-words">{item.note}</span>}
      </div>
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
          aria-label={`Zmień: ${item.name}`}
        >
          Zmień
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="text-destructive h-10"
          disabled={pending}
          onClick={onDelete}
          aria-label={`Usuń: ${item.name}`}
        >
          Usuń
        </Button>
      </div>
    </li>
  );
}
