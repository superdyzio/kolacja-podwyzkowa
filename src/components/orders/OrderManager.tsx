import { useMemo, useState } from "react";
import { useOrderBoard } from "@/components/hooks/useOrderBoard";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/guesses/amount";
import { dishSuggestions, lineTotal } from "@/lib/orders/rules";
import { describeLines, formatOrderSummary } from "@/lib/orders/summary";
import type { OrderBoardDto, OrderItemDto } from "@/types";
import { OrderItemForm, type OrderItemFormValues } from "./OrderItemForm";
import { OrderLineRow } from "./OrderLineRow";

interface Props {
  // Organizer API base, e.g. "/api/o/<key>".
  apiBase: string;
  initial: OrderBoardDto;
}

function sum(items: readonly OrderItemDto[]): number {
  return items.reduce((total, item) => total + lineTotal(item), 0);
}

// The organizer's order page (restaurant-orders): totals, a form for new lines, the prep list with sums and every line
// grouped where it is served — by the PUBLISHED seating, exactly as the restaurant sees it — with „Wydane”, edit and
// delete.
export function OrderManager({ apiBase, initial }: Props) {
  const { board, pending, failure, send, dismissFailure } = useOrderBoard(apiBase, initial);
  const [editingId, setEditingId] = useState<number | null>(null);
  const dishes = useMemo(() => dishSuggestions(board.items), [board.items]);
  const { totals, placement } = board;

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
    if (window.confirm(`Usunąć „${item.name} × ${String(item.quantity)}” z zamówienia?`)) {
      void send({ method: "DELETE", path: `/orders/${String(item.id)}` });
    }
  }

  function renderLines(items: readonly OrderItemDto[]) {
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
            onEdit={() => {
              setEditingId(item.id);
            }}
            onCancel={() => {
              setEditingId(null);
            }}
            onSave={(values) => saveLine(item.id, values)}
            onDelivered={(delivered) => {
              void send({ method: "PATCH", path: `/orders/${String(item.id)}`, body: { delivered } });
            }}
            onDelete={() => {
              deleteLine(item);
            }}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="order-total-heading" className="flex flex-col gap-1 rounded-xl border p-4 sm:p-6">
        <h2 id="order-total-heading" className="text-muted-foreground text-sm">
          Razem
        </h2>
        <p className="text-3xl font-bold">{formatAmount(totals.totalGrosze)}</p>
        <p className="text-sm" aria-live="polite">
          {formatOrderSummary(totals)}
        </p>
      </section>

      {failure && (
        <div role="alert" className="border-destructive/50 bg-destructive/5 flex flex-col gap-2 rounded-lg border p-3">
          <p className="text-destructive font-medium">{failure.message}</p>
          <Button type="button" variant="ghost" className="h-10 self-start" onClick={dismissFailure}>
            Zamknij
          </Button>
        </div>
      )}

      <section aria-labelledby="order-add-heading" className="flex flex-col gap-3 rounded-xl border p-4 sm:p-6">
        <h2 id="order-add-heading" className="text-xl font-semibold">
          Dodaj pozycję
        </h2>
        <p className="text-muted-foreground text-sm">
          Danie dla osoby trafia na jej miejsce z opublikowanego rozsadzenia; danie dla stolika — na środek stołu.
          Wpisane wcześniej dania podpowiadają się razem z ceną.
        </p>
        <OrderItemForm
          item={null}
          guests={board.guests}
          tables={board.tables}
          dishes={dishes}
          pending={pending}
          submitLabel="Dodaj"
          onSubmit={addLine}
        />
      </section>

      {board.prep.length > 0 && (
        <section aria-labelledby="order-prep-heading" className="flex flex-col gap-3">
          <h2 id="order-prep-heading" className="text-xl font-semibold">
            Do przygotowania
          </h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-2 font-medium">Danie</th>
                  <th className="p-2 text-right font-medium">Ilość</th>
                  <th className="p-2 text-right font-medium">Do wydania</th>
                  <th className="p-2 text-right font-medium">Kwota</th>
                </tr>
              </thead>
              <tbody>
                {board.prep.map((line) => (
                  <tr key={line.name} className="border-t align-top">
                    <td className="p-2">
                      <span className="font-medium">{line.name}</span>
                      {line.notes.map((note) => (
                        <span key={note.note} className="text-muted-foreground block">
                          {note.quantity} × {note.note}
                        </span>
                      ))}
                    </td>
                    <td className="p-2 text-right">{line.quantity}</td>
                    <td className="p-2 text-right">{line.toServe}</td>
                    <td className="p-2 text-right whitespace-nowrap">{formatAmount(line.totalGrosze)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section aria-labelledby="order-lines-heading" className="flex flex-col gap-4">
        <h2 id="order-lines-heading" className="text-xl font-semibold">
          {`Pozycje (${describeLines(totals.lines)})`}
        </h2>
        {!board.published && totals.lines > 0 && (
          <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
            Rozsadzenie nie jest jeszcze opublikowane: restauracja nie wie, gdzie podać dania. Opublikuj je na stronie
            „Rozsadzenie”.
          </p>
        )}
        {totals.lines === 0 && <p className="text-muted-foreground">Zamówienie jest puste.</p>}

        {placement.tables.map((table) => {
          const items = [...table.seats.flatMap((seat) => seat.items), ...table.tableItems];
          return (
            <article
              key={`${table.room} ${table.name}`}
              className="flex flex-col gap-3 rounded-xl border p-4"
              aria-label={`Stolik ${table.name}`}
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
                    <span>{`Miejsce ${String(seat.seat)} · ${seat.guestName}`}</span>
                    <span className="text-muted-foreground">{formatAmount(sum(seat.items))}</span>
                  </h4>
                  {renderLines(seat.items)}
                </div>
              ))}
              {table.tableItems.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h4 className="text-sm font-medium">Na stół</h4>
                  {renderLines(table.tableItems)}
                </div>
              )}
            </article>
          );
        })}

        {placement.unplaced.length > 0 && (
          <article
            className="flex flex-col gap-3 rounded-xl border border-amber-500/50 p-4"
            aria-label="Do rozstawienia"
          >
            <header className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold">Do rozstawienia</h3>
              <p className="text-muted-foreground text-sm">
                Osoby i stoliki, których nie ma w opublikowanym rozsadzeniu: opublikuj je albo przypisz pozycję inaczej.
              </p>
            </header>
            {placement.unplaced.map((group) => (
              <div key={`${group.kind} ${group.name}`} className="flex flex-col gap-2">
                <h4 className="flex flex-wrap justify-between gap-2 text-sm font-medium">
                  <span>{group.kind === "guest" ? group.name : `Stolik ${group.name}`}</span>
                  <span className="text-muted-foreground">{formatAmount(sum(group.items))}</span>
                </h4>
                {renderLines(group.items)}
              </div>
            ))}
          </article>
        )}

        {placement.unassigned.length > 0 && (
          <article className="flex flex-col gap-3 rounded-xl border p-4" aria-label="Nieprzypisane">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-semibold">Nieprzypisane</h3>
              <span className="font-semibold">{formatAmount(sum(placement.unassigned))}</span>
            </header>
            {renderLines(placement.unassigned)}
          </article>
        )}
      </section>
    </div>
  );
}
