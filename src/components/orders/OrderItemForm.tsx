import { useId, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAmountInput } from "@/lib/guesses/amount";
import type { Locale } from "@/lib/i18n";
import { orderMessages } from "@/lib/orders/messages";
import {
  dishKey,
  findDish,
  isValidQuantity,
  MAX_QUANTITY,
  MIN_QUANTITY,
  parseDishName,
  parseNote,
  parseUnitPrice,
  quantityMessage,
  type DishSuggestion,
} from "@/lib/orders/rules";
import { cn } from "@/lib/utils";
import type { OrderGuestOptionDto, OrderItemDto, OrderTableOptionDto } from "@/types";

// The body the order API takes (restaurant-orders): texts as typed, the price as typed; the server checks again.
export interface OrderItemFormValues {
  name: string;
  note: string;
  quantity: number;
  price: string;
  assignment: { guestId: number } | { tableId: number } | null;
}

interface Props {
  // Editing an existing line, or null for a new one.
  item: OrderItemDto | null;
  guests: readonly OrderGuestOptionDto[];
  tables: readonly OrderTableOptionDto[];
  dishes: readonly DishSuggestion[];
  pending: boolean;
  locale: Locale;
  submitLabel: string;
  // Resolves to true when saved (a new-line form then clears; an edit closes in the parent).
  onSubmit: (values: OrderItemFormValues) => Promise<boolean>;
  onCancel?: () => void;
}

const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-10 min-w-0 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]";

function assignmentValue(item: OrderItemDto | null): string {
  if (item?.guestId != null) {
    return `g:${String(item.guestId)}`;
  }
  if (item?.tableId != null) {
    return `t:${String(item.tableId)}`;
  }
  return "";
}

function toAssignment(value: string): OrderItemFormValues["assignment"] {
  const id = Number(value.slice(2));
  if (value.startsWith("g:") && Number.isInteger(id)) {
    return { guestId: id };
  }
  if (value.startsWith("t:") && Number.isInteger(id)) {
    return { tableId: id };
  }
  return null;
}

function guestLabel(guest: OrderGuestOptionDto, locale: Locale): string {
  const t = orderMessages(locale);
  const where = guest.seat ? t.guestSeat(guest.seat.table, guest.seat.seat) : t.guestNoSeat;
  return `${guest.displayName} — ${where}${guest.isAbsent ? t.guestAbsent : ""}`;
}

function tableLabel(table: OrderTableOptionDto, locale: Locale): string {
  return `${table.name} (${table.room})${table.published ? "" : orderMessages(locale).tableUnpublished}`;
}

// One order line in a form: the dish (suggesting the dishes already on the order, the price of the newest one filled
// in while the price field is untouched), price, quantity, note and who it is for. Checked here before sending, so
// a typo never costs a request. Keeps its own draft, so a board refresh never overwrites what is being typed.
export function OrderItemForm({
  item,
  guests,
  tables,
  dishes,
  pending,
  locale,
  submitLabel,
  onSubmit,
  onCancel,
}: Props) {
  const t = orderMessages(locale);
  const formId = useId();
  const [name, setName] = useState(item?.name ?? "");
  const [price, setPrice] = useState(item ? formatAmountInput(item.unitPriceGrosze) : "");
  const [priceTouched, setPriceTouched] = useState(item !== null);
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1));
  const [note, setNote] = useState(item?.note ?? "");
  const [assignment, setAssignment] = useState(assignmentValue(item));
  const [problem, setProblem] = useState<string | null>(null);

  function changeName(value: string) {
    setName(value);
    // While the price was not typed, it follows the dish: a known dish fills it in, anything else empties it (so
    // typing on past „Pierogi” to „Pierogi z mięsem” never keeps the pierogi's price).
    if (!priceTouched) {
      const dish = findDish(dishes, value);
      setPrice(dish ? formatAmountInput(dish.unitPriceGrosze) : "");
    }
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedName = parseDishName(name, locale);
    const parsedPrice = parseUnitPrice(price, locale);
    const parsedNote = parseNote(note, locale);
    const parsedQuantity = Number(quantity);
    for (const result of [parsedName, parsedPrice, parsedNote]) {
      if (!result.ok) {
        setProblem(result.message);
        return;
      }
    }
    if (!isValidQuantity(parsedQuantity)) {
      setProblem(quantityMessage(locale));
      return;
    }
    setProblem(null);
    // A dish already on the order keeps its spelling, so the prep list shows one line for it — except when an edit
    // only changes the spelling of the line's own dish.
    const known = item !== null && dishKey(name) === dishKey(item.name) ? null : findDish(dishes, name);
    const saved = await onSubmit({
      name: known?.name ?? name,
      note,
      quantity: parsedQuantity,
      price,
      assignment: toAssignment(assignment),
    });
    if (saved && item === null) {
      // Ready for the next line for the same person or table.
      setName("");
      setPrice("");
      setPriceTouched(false);
      setQuantity("1");
      setNote("");
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="grid grid-cols-2 gap-3 sm:grid-cols-6"
      aria-label={item ? t.editFormLabel(item.name) : t.newFormLabel}
    >
      <div className="col-span-2 flex flex-col gap-1 sm:col-span-3">
        <label htmlFor={`${formId}-name`} className="text-sm font-medium">
          {t.dish}
        </label>
        <Input
          id={`${formId}-name`}
          list={`${formId}-dishes`}
          autoComplete="off"
          value={name}
          onChange={(event) => {
            changeName(event.target.value);
          }}
          className="h-10"
        />
        <datalist id={`${formId}-dishes`}>
          {dishes.map((dish) => (
            <option key={dish.name} value={dish.name} />
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
          {t.quantityColumn}
        </label>
        <Input
          id={`${formId}-quantity`}
          type="number"
          inputMode="numeric"
          min={MIN_QUANTITY}
          max={MAX_QUANTITY}
          value={quantity}
          onChange={(event) => {
            setQuantity(event.target.value);
          }}
          className="h-10"
        />
      </div>
      <div className="col-span-2 flex flex-col gap-1 sm:col-span-3">
        <label htmlFor={`${formId}-for`} className="text-sm font-medium">
          {t.forWhom}
        </label>
        <select
          id={`${formId}-for`}
          value={assignment}
          onChange={(event) => {
            setAssignment(event.target.value);
          }}
          className={SELECT_CLASS}
        >
          <option value="">{t.unassignedOption}</option>
          {guests.length > 0 && (
            <optgroup label={t.guestGroup}>
              {guests.map((guest) => (
                <option key={guest.id} value={`g:${String(guest.id)}`}>
                  {guestLabel(guest, locale)}
                </option>
              ))}
            </optgroup>
          )}
          {tables.length > 0 && (
            <optgroup label={t.tableGroup}>
              {tables.map((table) => (
                <option key={table.id} value={`t:${String(table.id)}`}>
                  {tableLabel(table, locale)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      <div className="col-span-2 flex flex-col gap-1 sm:col-span-3">
        <label htmlFor={`${formId}-note`} className="text-sm font-medium">
          {t.note} <span className="text-muted-foreground font-normal">{t.optional}</span>
        </label>
        <Input
          id={`${formId}-note`}
          autoComplete="off"
          placeholder={t.notePlaceholder}
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
          }}
          className="h-10"
        />
      </div>
      {problem && (
        <p role="alert" className="text-destructive col-span-2 text-sm font-medium sm:col-span-6">
          {problem}
        </p>
      )}
      <div className={cn("col-span-2 flex flex-wrap gap-2 sm:col-span-6")}>
        <Button type="submit" className="h-10" disabled={pending}>
          {submitLabel}
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
