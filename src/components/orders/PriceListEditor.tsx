import { useId, useState, type SubmitEvent } from "react";
import { priceRowKey, usePriceList } from "@/components/hooks/usePriceList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAmount, formatAmountInput } from "@/lib/guesses/amount";
import type { Locale } from "@/lib/i18n";
import { priceMessages } from "@/lib/orders/messages";
import type { PriceKind, PriceListRowDto } from "@/types";

interface Props {
  // The event's panel API, /api/panel/events/<id>.
  apiBase: string;
  initial: PriceListRowDto[];
  locale: Locale;
}

interface RowProps {
  row: PriceListRowDto;
  pending: boolean;
  problem: string | null;
  saved: boolean;
  locale: Locale;
  onSave: (kind: PriceKind, name: string, text: string) => Promise<boolean>;
}

function PriceRow({ row, pending, problem, saved, locale, onSave }: RowProps) {
  const t = priceMessages(locale);
  const inputId = useId();
  const [text, setText] = useState(formatAmountInput(row.priceGrosze));
  const meta = [t.lines(row.lines), row.mixed ? t.mixed : null, row.priceGrosze === 0 ? t.unset : null]
    .filter((part) => part !== null)
    .join(" · ");

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSave(row.kind, row.name, text);
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3" data-price-row={row.name}>
      <form noValidate onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-40 flex-1 flex-col gap-0.5">
          <label htmlFor={inputId} className="font-medium break-words">
            {row.name}
          </label>
          <span className="text-muted-foreground text-sm">
            {formatAmount(row.priceGrosze)} · {meta}
          </span>
        </div>
        <div className="relative w-32">
          <Input
            id={inputId}
            inputMode="decimal"
            autoComplete="off"
            aria-label={t.priceLabel(row.name)}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
            }}
            className="h-10 pr-9"
          />
          <span
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm"
          >
            zł
          </span>
        </div>
        <Button type="submit" className="h-10" disabled={pending}>
          {pending ? t.saving : t.save}
        </Button>
      </form>
      {problem && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {problem}
        </p>
      )}
      {saved && !problem && (
        <p aria-live="polite" className="text-sm text-emerald-700">
          {t.saved(row.name, formatAmount(row.priceGrosze))}
        </p>
      )}
    </li>
  );
}

// „Cennik wydarzenia” on the panel's orders page (client-restaurant-split, FR-027): one row per dish or drink name of
// the event with its price; saving sets the price of every line of that name. Owners and managers, whoever leads (the
// client never sets prices); support mode does not get it.
export function PriceListEditor({ apiBase, initial, locale }: Props) {
  const t = priceMessages(locale);
  const { rows, pendingKey, failure, savedKey, save } = usePriceList(apiBase, initial, locale);
  const groups = [
    { kind: "dish" as const, heading: t.dishes, rows: rows.filter((row) => row.kind === "dish") },
    { kind: "drink" as const, heading: t.drinks, rows: rows.filter((row) => row.kind === "drink") },
  ].filter((group) => group.rows.length > 0);

  return (
    <section
      aria-labelledby="price-list-heading"
      className="flex flex-col gap-4 rounded-xl border p-4 sm:p-6"
      data-price-list
    >
      <header className="flex flex-col gap-1">
        <h2 id="price-list-heading" className="text-xl font-semibold">
          {t.heading}
        </h2>
        <p className="text-muted-foreground text-sm">{t.intro}</p>
      </header>
      {groups.length === 0 && <p className="text-muted-foreground text-sm">{t.empty}</p>}
      {groups.map((group) => (
        <div key={group.kind} className="flex flex-col gap-2">
          <h3 className="font-semibold">{group.heading}</h3>
          <ul className="flex flex-col gap-2">
            {group.rows.map((row) => {
              const key = priceRowKey(row);
              return (
                <PriceRow
                  // A new price from the server resets the field.
                  key={`${key}:${String(row.priceGrosze)}`}
                  row={row}
                  pending={pendingKey === key}
                  problem={failure?.key === key ? failure.problem.message : null}
                  saved={savedKey === key}
                  locale={locale}
                  onSave={save}
                />
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
