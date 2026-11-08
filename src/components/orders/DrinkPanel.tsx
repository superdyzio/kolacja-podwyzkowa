import { useId, useMemo, useState, type SubmitEvent } from "react";
import type { OrderRequest } from "@/components/hooks/useOrderBoard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAmount, formatAmountInput } from "@/lib/guesses/amount";
import type { Locale } from "@/lib/i18n";
import {
  drinkQuantityMessage,
  isValidDrinkQuantity,
  MAX_DRINK_QUANTITY,
  MIN_DRINK_QUANTITY,
  parseDrinkName,
} from "@/lib/orders/drinks";
import { drinkMessages } from "@/lib/orders/messages";
import { dishKey, dishSuggestions, findDish, parseUnitPrice, type DishSuggestion } from "@/lib/orders/rules";
import type { DrinkItemDto, DrinkTotalsDto } from "@/types";

// The body the drinks API takes (bill-drinks): the name and the price as typed; the server checks again.
interface DrinkFormValues {
  name: string;
  price: string;
  quantity: number;
}

interface FormProps {
  // Editing an existing drink, or null for a new one.
  drink: DrinkItemDto | null;
  suggestions: readonly DishSuggestion[];
  pending: boolean;
  locale: Locale;
  // Resolves to true when saved (a new-drink form then clears; an edit closes in the parent).
  onSubmit: (values: DrinkFormValues) => Promise<boolean>;
  onCancel?: () => void;
}

// One drink line in a form: name (suggesting the drinks already entered, the newest price filled in while the price
// field is untouched), price per item and quantity. Checked here before sending; keeps its own draft, so a board
// refresh never overwrites what is being typed.
function DrinkForm({ drink, suggestions, pending, locale, onSubmit, onCancel }: FormProps) {
  const t = drinkMessages(locale);
  const formId = useId();
  const [name, setName] = useState(drink?.name ?? "");
  const [price, setPrice] = useState(drink ? formatAmountInput(drink.unitPriceGrosze) : "");
  const [priceTouched, setPriceTouched] = useState(drink !== null);
  const [quantity, setQuantity] = useState(String(drink?.quantity ?? 1));
  const [problem, setProblem] = useState<string | null>(null);

  function changeName(value: string) {
    setName(value);
    if (!priceTouched) {
      const known = findDish(suggestions, value);
      setPrice(known ? formatAmountInput(known.unitPriceGrosze) : "");
    }
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedName = parseDrinkName(name, locale);
    const parsedPrice = parseUnitPrice(price, locale);
    const parsedQuantity = Number(quantity);
    for (const result of [parsedName, parsedPrice]) {
      if (!result.ok) {
        setProblem(result.message);
        return;
      }
    }
    if (!isValidDrinkQuantity(parsedQuantity)) {
      setProblem(drinkQuantityMessage(locale));
      return;
    }
    setProblem(null);
    // A drink already on the list keeps its spelling — except when an edit only changes its own spelling.
    const known = drink !== null && dishKey(name) === dishKey(drink.name) ? null : findDish(suggestions, name);
    const saved = await onSubmit({ name: known?.name ?? name, price, quantity: parsedQuantity });
    if (saved && drink === null) {
      setName("");
      setPrice("");
      setPriceTouched(false);
      setQuantity("1");
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="grid grid-cols-2 gap-3 sm:grid-cols-6"
      aria-label={drink ? t.editFormLabel(drink.name) : t.newFormLabel}
    >
      <div className="col-span-2 flex flex-col gap-1 sm:col-span-3">
        <label htmlFor={`${formId}-name`} className="text-sm font-medium">
          {t.name}
        </label>
        <Input
          id={`${formId}-name`}
          list={`${formId}-drinks`}
          autoComplete="off"
          placeholder={t.namePlaceholder}
          value={name}
          onChange={(event) => {
            changeName(event.target.value);
          }}
          className="h-10"
        />
        <datalist id={`${formId}-drinks`}>
          {suggestions.map((known) => (
            <option key={known.name} value={known.name} />
          ))}
        </datalist>
      </div>
      <div className="flex flex-col gap-1 sm:col-span-2">
        <label htmlFor={`${formId}-price`} className="text-sm font-medium">
          {t.unitPrice}
        </label>
        <div className="relative">
          <Input
            id={`${formId}-price`}
            inputMode="decimal"
            autoComplete="off"
            placeholder={t.pricePlaceholder}
            value={price}
            onChange={(event) => {
              setPrice(event.target.value);
              setPriceTouched(true);
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
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${formId}-quantity`} className="text-sm font-medium">
          {t.quantity}
        </label>
        <Input
          id={`${formId}-quantity`}
          type="number"
          inputMode="numeric"
          min={MIN_DRINK_QUANTITY}
          max={MAX_DRINK_QUANTITY}
          value={quantity}
          onChange={(event) => {
            setQuantity(event.target.value);
          }}
          className="h-10"
        />
      </div>
      {problem && (
        <p role="alert" className="text-destructive col-span-2 text-sm font-medium sm:col-span-6">
          {problem}
        </p>
      )}
      <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-6">
        <Button type="submit" className="h-10" disabled={pending}>
          {drink ? t.save : t.add}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" className="h-10" onClick={onCancel}>
            {t.cancel}
          </Button>
        )}
      </div>
    </form>
  );
}

interface Props {
  drinks: readonly DrinkItemDto[];
  totals: DrinkTotalsDto;
  pending: boolean;
  locale: Locale;
  // useOrderBoard's queue: every answer is the whole board.
  send: (request: OrderRequest) => Promise<boolean>;
}

// „Napoje do rachunku” on the organizer's order page (bill-drinks): the drinks on the restaurant's bill — name, price
// per item, quantity — for nobody in particular and seen by nobody but the organizer; their sum goes into the bill
// total at the top of the page.
export function DrinkPanel({ drinks, totals, pending, locale, send }: Props) {
  const t = drinkMessages(locale);
  const [editingId, setEditingId] = useState<number | null>(null);
  const suggestions = useMemo(() => dishSuggestions(drinks), [drinks]);

  function add(values: DrinkFormValues) {
    return send({ method: "POST", path: "/drinks", body: values });
  }

  async function save(id: number, values: DrinkFormValues) {
    const saved = await send({ method: "PATCH", path: `/drinks/${String(id)}`, body: values });
    if (saved) {
      setEditingId(null);
    }
    return saved;
  }

  function remove(drink: DrinkItemDto) {
    if (window.confirm(t.confirmDelete(drink.name, drink.quantity))) {
      void send({ method: "DELETE", path: `/drinks/${String(drink.id)}` });
    }
  }

  return (
    <section
      id="napoje"
      aria-labelledby="drinks-heading"
      className="flex scroll-mt-4 flex-col gap-3 rounded-xl border p-4 sm:p-6"
    >
      <h2 id="drinks-heading" className="text-xl font-semibold">
        {t.heading}
      </h2>
      <p className="text-muted-foreground text-sm">{t.intro}</p>
      <DrinkForm drink={null} suggestions={suggestions} pending={pending} locale={locale} onSubmit={add} />
      {drinks.length === 0 ? (
        <p className="text-muted-foreground">{t.empty}</p>
      ) : (
        <ul aria-label={t.listLabel} className="flex flex-col gap-2">
          {drinks.map((drink) =>
            editingId === drink.id ? (
              <li key={drink.id} className="rounded-lg border p-3">
                <DrinkForm
                  drink={drink}
                  suggestions={suggestions}
                  pending={pending}
                  locale={locale}
                  onSubmit={(values) => save(drink.id, values)}
                  onCancel={() => {
                    setEditingId(null);
                  }}
                />
              </li>
            ) : (
              <li key={drink.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border p-3">
                <span className="min-w-0 flex-1 basis-40 font-medium break-words">
                  {drink.name} × {drink.quantity}
                </span>
                <span className="flex flex-col items-end text-right">
                  <span className="font-semibold whitespace-nowrap">
                    {formatAmount(drink.quantity * drink.unitPriceGrosze)}
                  </span>
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {drink.quantity} × {formatAmount(drink.unitPriceGrosze)}
                  </span>
                </span>
                <span className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    disabled={pending}
                    onClick={() => {
                      setEditingId(drink.id);
                    }}
                    aria-label={t.editLabel(drink.name)}
                  >
                    {t.edit}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive h-10"
                    disabled={pending}
                    onClick={() => {
                      remove(drink);
                    }}
                    aria-label={t.removeLabel(drink.name)}
                  >
                    {t.remove}
                  </Button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}
      <p className="flex flex-wrap justify-between gap-2 border-t pt-3 font-semibold">
        <span>{t.total}</span>
        <span className="whitespace-nowrap">{formatAmount(totals.totalGrosze)}</span>
      </p>
    </section>
  );
}
