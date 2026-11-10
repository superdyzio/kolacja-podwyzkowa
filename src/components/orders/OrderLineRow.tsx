import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/guesses/amount";
import type { Locale } from "@/lib/i18n";
import { orderMessages, servingMessages } from "@/lib/orders/messages";
import { isPieceDelivered } from "@/lib/orders/pieces";
import { lineTotal, type DishSuggestion } from "@/lib/orders/rules";
import { cn } from "@/lib/utils";
import type { OrderGuestOptionDto, OrderItemDto, OrderMenuDto, OrderPieceMarkDto, OrderTableOptionDto } from "@/types";
import { OrderItemForm, type OrderItemFormValues } from "./OrderItemForm";

interface Props {
  item: OrderItemDto;
  editing: boolean;
  pending: boolean;
  guests: readonly OrderGuestOptionDto[];
  tables: readonly OrderTableOptionDto[];
  dishes: readonly DishSuggestion[];
  // menu-catalog-courses: the event's available menu (an active one turns the dish field into a list).
  menu: OrderMenuDto;
  locale: Locale;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (values: OrderItemFormValues) => Promise<boolean>;
  // Resolves once the answer has replaced the board.
  onDelivered: (delivered: boolean) => Promise<unknown>;
  // guest-delivered: one piece (1-based) of a line with more than one.
  onPiece: (piece: number, delivered: boolean) => Promise<unknown>;
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
  menu,
  locale,
  onEdit,
  onCancel,
  onSave,
  onDelivered,
  onPiece,
  onDelete,
  selected = false,
  onSelect = null,
}: Props) {
  // The box (and every piece) shows the latest tick at once, so a quick second click sends the opposite value; the
  // server's value shows again once every tick of this line has been answered (a failed save then shows what is
  // really stored). A whole-line tick overrides the piece ticks made before it.
  const [ticked, setTicked] = useState<boolean | null>(null);
  const [pieceTicks, setPieceTicks] = useState<ReadonlyMap<number, boolean>>(new Map());
  const inFlight = useRef(0);
  const t = orderMessages(locale);
  const s = servingMessages(locale);
  const pieces = Array.from({ length: item.quantity }, (_, index) => index + 1);
  const isDone = (piece: number) => pieceTicks.get(piece) ?? ticked ?? isPieceDelivered(item, piece);
  const doneCount = pieces.filter(isDone).length;
  const delivered = doneCount === item.quantity;
  const partly = doneCount > 0 && !delivered;
  // No marks in an answer of an older server (during a deploy): nothing to show, no crash.
  const sent: unknown = item.marks;
  const marks = new Map((Array.isArray(sent) ? item.marks : []).map((mark) => [mark.piece, mark]));

  function settle(request: Promise<unknown>) {
    inFlight.current += 1;
    void request.finally(() => {
      inFlight.current -= 1;
      if (inFlight.current === 0) {
        setTicked(null);
        setPieceTicks(new Map());
      }
    });
  }

  function tick(value: boolean) {
    setTicked(value);
    setPieceTicks(new Map());
    settle(onDelivered(value));
  }

  function tickPiece(piece: number, value: boolean) {
    setPieceTicks((current) => new Map(current).set(piece, value));
    settle(onPiece(piece, value));
  }

  // Who marked a piece: a guest's (live) name, or „Ciebie” for the organizer.
  function marker(mark: OrderPieceMarkDto, short: boolean): string {
    if (mark.by === "organizer") {
      return short ? t.markerYouShort : t.markerOrganizer;
    }
    return guests.find((guest) => guest.id === mark.guestId)?.displayName ?? t.markerDeletedGuest;
  }
  const singleMark = item.quantity === 1 && isDone(1) ? marks.get(1) : undefined;

  if (editing) {
    return (
      <li className="rounded-lg border p-3">
        <OrderItemForm
          item={item}
          guests={guests}
          tables={tables}
          dishes={dishes}
          menu={menu}
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
          ref={(input) => {
            if (input) {
              input.indeterminate = partly;
            }
          }}
          onChange={(event) => {
            tick(event.target.checked);
          }}
          className="size-5 accent-emerald-600"
        />
        <span className="flex flex-col text-sm">
          <span>{partly ? t.partlyServed(doneCount, item.quantity) : t.delivered}</span>
          {singleMark && <span className="text-muted-foreground text-xs">{t.markedBy(marker(singleMark, false))}</span>}
        </span>
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
      {item.quantity > 1 && (
        <ul aria-label={t.piecesLabel(item.name)} className="flex basis-full flex-wrap gap-1.5">
          {pieces.map((piece) => {
            const done = isDone(piece);
            const mark = done ? marks.get(piece) : undefined;
            return (
              <li key={piece}>
                <button
                  type="button"
                  aria-pressed={done}
                  aria-label={t.pieceToggle(piece, item.quantity, done)}
                  title={mark ? t.markedBy(marker(mark, false)) : undefined}
                  onClick={() => {
                    tickPiece(piece, !done);
                  }}
                  className={cn(
                    "flex min-h-10 items-center gap-1 rounded-full border px-3 py-1 text-sm",
                    "hover:bg-muted focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                    done && "border-emerald-600 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
                  )}
                >
                  <span aria-hidden="true">{done ? "✓" : "○"}</span>
                  <span className="font-semibold tabular-nums">{piece}</span>
                  {mark && <span className="text-xs">· {marker(mark, true)}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
