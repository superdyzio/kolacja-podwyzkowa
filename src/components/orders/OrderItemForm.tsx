import { useId, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAmountInput } from "@/lib/guesses/amount";
import {
  findDish,
  isValidQuantity,
  MAX_QUANTITY,
  MIN_QUANTITY,
  parseDishName,
  parseNote,
  parseUnitPrice,
  QUANTITY_MESSAGE,
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

function guestLabel(guest: OrderGuestOptionDto): string {
  const where = guest.seat ? `${guest.seat.table}, miejsce ${guest.seat.seat}` : "bez miejsca na planie";
  return `${guest.displayName} — ${where}${guest.isAbsent ? " (nieobecny)" : ""}`;
}

function tableLabel(table: OrderTableOptionDto): string {
  return `${table.name} (${table.room})${table.published ? "" : " — nieopublikowany"}`;
}

// One order line in a form: the dish (suggesting the dishes already on the order, the price of the newest one filled
// in while the price field is untouched), price, quantity, note and who it is for. Checked here before sending, so
// a typo never costs a request. Keeps its own draft, so a board refresh never overwrites what is being typed.
export function OrderItemForm({ item, guests, tables, dishes, pending, submitLabel, onSubmit, onCancel }: Props) {
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
    const dish = findDish(dishes, value);
    if (dish && !priceTouched) {
      setPrice(formatAmountInput(dish.unitPriceGrosze));
    }
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedName = parseDishName(name);
    const parsedPrice = parseUnitPrice(price);
    const parsedNote = parseNote(note);
    const parsedQuantity = Number(quantity);
    for (const result of [parsedName, parsedPrice, parsedNote]) {
      if (!result.ok) {
        setProblem(result.message);
        return;
      }
    }
    if (!isValidQuantity(parsedQuantity)) {
      setProblem(QUANTITY_MESSAGE);
      return;
    }
    setProblem(null);
    // A dish already on the order keeps its spelling, so the prep list shows one line for it.
    const known = findDish(dishes, name);
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
      aria-label={item ? `Zmień pozycję: ${item.name}` : "Nowa pozycja zamówienia"}
    >
      <div className="col-span-2 flex flex-col gap-1 sm:col-span-3">
        <label htmlFor={`${formId}-name`} className="text-sm font-medium">
          Danie
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
          Cena za sztukę
        </label>
        <div className="relative">
          <Input
            id={`${formId}-price`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="np. 49,90"
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
          Ilość
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
          Dla kogo
        </label>
        <select
          id={`${formId}-for`}
          value={assignment}
          onChange={(event) => {
            setAssignment(event.target.value);
          }}
          className={SELECT_CLASS}
        >
          <option value="">Nieprzypisane</option>
          {guests.length > 0 && (
            <optgroup label="Osoba (podanie na jej miejsce)">
              {guests.map((guest) => (
                <option key={guest.id} value={`g:${String(guest.id)}`}>
                  {guestLabel(guest)}
                </option>
              ))}
            </optgroup>
          )}
          {tables.length > 0 && (
            <optgroup label="Stolik (na środek stołu)">
              {tables.map((table) => (
                <option key={table.id} value={`t:${String(table.id)}`}>
                  {tableLabel(table)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      <div className="col-span-2 flex flex-col gap-1 sm:col-span-3">
        <label htmlFor={`${formId}-note`} className="text-sm font-medium">
          Uwaga dla kuchni <span className="text-muted-foreground font-normal">(opcjonalnie)</span>
        </label>
        <Input
          id={`${formId}-note`}
          autoComplete="off"
          placeholder="np. bez cebuli"
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
            Anuluj
          </Button>
        )}
      </div>
    </form>
  );
}
