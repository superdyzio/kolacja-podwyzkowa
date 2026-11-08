import { Fragment, useMemo, useState } from "react";
import { useOrderBoard } from "@/components/hooks/useOrderBoard";
import { useServingSelection } from "@/components/hooks/useServingSelection";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/guesses/amount";
import type { Locale } from "@/lib/i18n";
import { billTotalGrosze } from "@/lib/orders/drinks";
import { drinkMessages, orderMessages, servingMessages } from "@/lib/orders/messages";
import { dishKey, dishSuggestions, lineTotal } from "@/lib/orders/rules";
import { describeLines, formatOrderSummary } from "@/lib/orders/summary";
import { cn } from "@/lib/utils";
import type { OrderBoardDto, OrderItemDto } from "@/types";
import type { OrderRequest } from "@/components/hooks/useOrderBoard";
import { DishInstanceChips } from "./DishInstanceChips";
import { DrinkPanel } from "./DrinkPanel";
import { OrderItemForm, type OrderItemFormValues } from "./OrderItemForm";
import { OrderLineRow } from "./OrderLineRow";
import { ServingPlan } from "./ServingPlan";

interface Props {
  // Organizer API base, e.g. "/api/o/<key>".
  apiBase: string;
  initial: OrderBoardDto;
  locale: Locale;
}

function sum(items: readonly OrderItemDto[]): number {
  return items.reduce((total, item) => total + lineTotal(item), 0);
}

// Lines keep their selection across answers by id (serving-highlight).
function lineKey(item: OrderItemDto): string {
  return `line:${String(item.id)}`;
}

// The organizer's order page (restaurant-orders): totals, a form for new lines, the prep list with sums and every line
// grouped where it is served — by the PUBLISHED seating, exactly as the restaurant sees it — with „Wydane”, edit and
// delete. serving-highlight: the plan beside the lists (above them on narrow screens, pinned while something is picked)
// lights up where a dish, one piece of it or a line goes. bill-drinks: „Napoje do rachunku” at the bottom (the
// organizer's own list) and the bill total (dishes + drinks) at the top.
export function OrderManager({ apiBase, initial, locale }: Props) {
  const t = orderMessages(locale);
  const s = servingMessages(locale);
  const d = drinkMessages(locale);
  const { board, pending, failure, send: sendRequest, dismissFailure } = useOrderBoard(apiBase, initial, locale);
  // Where a failed save is reported: next to the drinks panel for its own requests, at the top for everything else.
  const [failureAtDrinks, setFailureAtDrinks] = useState(false);
  const send = (request: OrderRequest) => {
    setFailureAtDrinks(false);
    return sendRequest(request);
  };
  const sendDrink = (request: OrderRequest) => {
    setFailureAtDrinks(true);
    return sendRequest(request);
  };
  const [editingId, setEditingId] = useState<number | null>(null);
  const dishes = useMemo(() => dishSuggestions(board.items), [board.items]);
  const { totals, placement } = board;
  const serving = useServingSelection(placement, board.prep, lineKey);
  const servingTables = useMemo(() => new Set(placement.tables.map((table) => table.name)), [placement.tables]);

  function body(values: OrderItemFormValues) {
    return { ...values, note: values.note.trim() === "" ? null : values.note };
  }

  function addLine(values: OrderItemFormValues) {
    return send({ method: "POST", path: "/orders", body: body(values) });
  }

  async function saveLine(id: number, values: OrderItemFormValues) {
    const saved = await send({ method: "PATCH", path: `/orders/${String(id)}`, body: body(values) });
    if (saved) {
      setEditingId(null);
    }
    return saved;
  }

  function deleteLine(item: OrderItemDto) {
    if (window.confirm(t.confirmDelete(item.name, item.quantity))) {
      void send({ method: "DELETE", path: `/orders/${String(item.id)}` });
    }
  }

  // onPlan: the lines sit at a published seat or table, so they can light it up.
  function renderLines(items: readonly OrderItemDto[], onPlan: boolean) {
    return (
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <OrderLineRow
            key={item.id}
            item={item}
            editing={editingId === item.id}
            pending={pending}
            guests={board.guests}
            tables={board.tables}
            dishes={dishes}
            locale={locale}
            onEdit={() => {
              setEditingId(item.id);
            }}
            onCancel={() => {
              setEditingId(null);
            }}
            onSave={(values) => saveLine(item.id, values)}
            onDelivered={(delivered) =>
              send({ method: "PATCH", path: `/orders/${String(item.id)}`, body: { delivered } })
            }
            onPiece={(piece, delivered) =>
              send({ method: "PUT", path: `/orders/${String(item.id)}/pieces`, body: { piece, delivered } })
            }
            onDelete={() => {
              deleteLine(item);
            }}
            selected={serving.selectedSpot === lineKey(item)}
            onSelect={
              onPlan
                ? () => {
                    serving.toggleSpot(lineKey(item));
                  }
                : null
            }
          />
        ))}
      </ul>
    );
  }

  const failureAlert = failure && (
    <div role="alert" className="border-destructive/50 bg-destructive/5 flex flex-col gap-2 rounded-lg border p-3">
      <p className="text-destructive font-medium">{failure.message}</p>
      <Button type="button" variant="ghost" className="h-10 self-start" onClick={dismissFailure}>
        {t.close}
      </Button>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <div className="flex flex-col gap-6 lg:col-start-1 lg:row-start-1">
        <section aria-labelledby="order-total-heading" className="flex flex-col gap-1 rounded-xl border p-4 sm:p-6">
          <h2 id="order-total-heading" className="text-muted-foreground text-sm">
            {d.billTotal}
          </h2>
          <p className="text-3xl font-bold" aria-live="polite">
            {formatAmount(billTotalGrosze(totals, board.drinkTotals))}
          </p>
          <p className="text-sm">
            {d.billParts(formatAmount(totals.totalGrosze), formatAmount(board.drinkTotals.totalGrosze))} ·{" "}
            <a href="#napoje" className="underline underline-offset-4">
              {d.heading}
            </a>
          </p>
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {formatOrderSummary(totals, locale)}
          </p>
        </section>

        {!failureAtDrinks && failureAlert}

        <section aria-labelledby="order-add-heading" className="flex flex-col gap-3 rounded-xl border p-4 sm:p-6">
          <h2 id="order-add-heading" className="text-xl font-semibold">
            {t.addHeading}
          </h2>
          <p className="text-muted-foreground text-sm">{t.addIntro}</p>
          <OrderItemForm
            item={null}
            guests={board.guests}
            tables={board.tables}
            dishes={dishes}
            pending={pending}
            locale={locale}
            submitLabel={t.add}
            onSubmit={addLine}
          />
        </section>
      </div>

      <ServingPlan
        apiBase={apiBase}
        seating={board.seating}
        servingTables={servingTables}
        selection={serving.resolved}
        onClear={serving.clear}
        locale={locale}
        className={cn(
          "bg-background lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1",
          serving.resolved &&
            "sticky top-0 z-10 -mx-4 px-4 py-2 shadow-md sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0 lg:py-0 lg:shadow-none",
        )}
      />

      <div className="flex flex-col gap-6 lg:col-start-1 lg:row-start-2">
        {board.prep.length > 0 && (
          <section aria-labelledby="order-prep-heading" className="flex flex-col gap-3">
            <h2 id="order-prep-heading" className="text-xl font-semibold">
              {t.prepHeading}
            </h2>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="p-2 font-medium">{t.dish}</th>
                    <th className="p-2 text-right font-medium">{t.quantityColumn}</th>
                    <th className="p-2 text-right font-medium">{t.toServe}</th>
                    <th className="p-2 text-right font-medium">{t.amount}</th>
                  </tr>
                </thead>
                <tbody>
                  {board.prep.map((line) => {
                    const key = dishKey(line.name);
                    const dish = serving.dishes.get(key);
                    const picked = serving.selectedDish === key;
                    return (
                      <Fragment key={line.name}>
                        <tr className={cn("border-t align-top", picked && "bg-red-500/10")}>
                          <td className="p-0">
                            <button
                              type="button"
                              aria-pressed={picked}
                              title={s.showDish(line.name)}
                              onClick={() => {
                                serving.toggleDish(key);
                              }}
                              className={cn(
                                "flex min-h-10 w-full flex-col items-start p-2 text-left",
                                "hover:bg-muted focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
                                picked && "hover:bg-red-500/15",
                              )}
                            >
                              <span className={cn("font-medium", picked && "text-red-700 dark:text-red-400")}>
                                {line.name}
                              </span>
                              {line.notes.map((note) => (
                                <span key={note.note} className="text-muted-foreground block">
                                  {note.quantity} × {note.note}
                                </span>
                              ))}
                            </button>
                          </td>
                          <td className="p-2 text-right">{line.quantity}</td>
                          <td className="p-2 text-right">{line.toServe}</td>
                          <td className="p-2 text-right whitespace-nowrap">{formatAmount(line.totalGrosze)}</td>
                        </tr>
                        {picked && dish && dish.instances.length > 1 && (
                          <tr className="bg-red-500/5">
                            <td colSpan={4} className="p-2">
                              <DishInstanceChips
                                dish={dish}
                                selected={serving.selectedInstance}
                                onSelect={(instance) => {
                                  serving.toggleInstance(key, instance);
                                }}
                                locale={locale}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section aria-labelledby="order-lines-heading" className="flex flex-col gap-4">
          <h2 id="order-lines-heading" className="text-xl font-semibold">
            {t.linesHeading(describeLines(totals.lines, locale))}
          </h2>
          {!board.published && totals.lines > 0 && (
            <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">{t.unpublished}</p>
          )}
          {totals.lines === 0 && <p className="text-muted-foreground">{t.empty}</p>}

          {placement.tables.map((table) => {
            const items = [...table.seats.flatMap((seat) => seat.items), ...table.tableItems];
            return (
              <article
                key={`${table.room} ${table.name}`}
                className="flex flex-col gap-3 rounded-xl border p-4"
                aria-label={t.table(table.name)}
              >
                <header className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-lg font-semibold">
                    {table.name} <span className="text-muted-foreground text-sm font-normal">{table.room}</span>
                  </h3>
                  <span className="font-semibold">{formatAmount(sum(items))}</span>
                </header>
                {table.seats.map((seat) => (
                  <div key={seat.seat} className="flex flex-col gap-2">
                    <h4 className="flex flex-wrap justify-between gap-2 text-sm font-medium">
                      <span>{t.seat(seat.seat, seat.guestName)}</span>
                      <span className="text-muted-foreground">{formatAmount(sum(seat.items))}</span>
                    </h4>
                    {renderLines(seat.items, true)}
                  </div>
                ))}
                {table.tableItems.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h4 className="text-sm font-medium">{t.onTable}</h4>
                    {renderLines(table.tableItems, true)}
                  </div>
                )}
              </article>
            );
          })}

          {placement.unplaced.length > 0 && (
            <article
              className="flex flex-col gap-3 rounded-xl border border-amber-500/50 p-4"
              aria-label={t.unplacedHeading}
            >
              <header className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold">{t.unplacedHeading}</h3>
                <p className="text-muted-foreground text-sm">{t.unplacedText}</p>
              </header>
              {placement.unplaced.map((group) => (
                <div key={`${group.kind} ${group.name}`} className="flex flex-col gap-2">
                  <h4 className="flex flex-wrap justify-between gap-2 text-sm font-medium">
                    <span>{group.kind === "guest" ? group.name : t.table(group.name)}</span>
                    <span className="text-muted-foreground">{formatAmount(sum(group.items))}</span>
                  </h4>
                  {renderLines(group.items, false)}
                </div>
              ))}
            </article>
          )}

          {placement.unassigned.length > 0 && (
            <article className="flex flex-col gap-3 rounded-xl border p-4" aria-label={t.unassignedHeading}>
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold">{t.unassignedHeading}</h3>
                <span className="font-semibold">{formatAmount(sum(placement.unassigned))}</span>
              </header>
              {renderLines(placement.unassigned, false)}
            </article>
          )}
        </section>

        {failureAtDrinks && failureAlert}
        <DrinkPanel
          drinks={board.drinks}
          totals={board.drinkTotals}
          pending={pending}
          locale={locale}
          send={sendDrink}
        />
      </div>
    </div>
  );
}
