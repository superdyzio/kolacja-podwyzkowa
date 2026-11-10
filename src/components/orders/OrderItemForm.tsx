import { useId, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAmount } from "@/lib/guesses/amount";
import type { Locale } from "@/lib/i18n";
import { orderMessages, priceMessages } from "@/lib/orders/messages";
import {
  dishKey,
  findDish,
  isValidQuantity,
  MAX_QUANTITY,
  MIN_QUANTITY,
  parseDishName,
  parseNote,
  quantityMessage,
  type DishSuggestion,
} from "@/lib/orders/rules";
import { cn } from "@/lib/utils";
import { courseLabel, findMenuItem, groupByCourse } from "@/lib/menu/rules";
import { menuMessages } from "@/lib/menu/messages";
import type { OrderGuestOptionDto, OrderItemDto, OrderMenuDto, OrderTableOptionDto } from "@/types";

// The body the order API takes (restaurant-orders): texts as typed; the server checks again. No price since
// client-restaurant-split (FR-027): a line takes the venue's price of its name.
export interface OrderItemFormValues {
  name: string;
  note: string;
  quantity: number;
  assignment: { guestId: number } | { tableId: number } | null;
}

interface Props {
  // Editing an existing line, or null for a new one.
  item: OrderItemDto | null;
  guests: readonly OrderGuestOptionDto[];
  tables: readonly OrderTableOptionDto[];
  dishes: readonly DishSuggestion[];
  // menu-catalog-courses (S-16): while active, the dish is picked from the event's menu (grouped by course, with
  // prices); otherwise typed as before.
  menu: OrderMenuDto;
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

// One order line in a form: the dish (suggesting the dishes already on the order), quantity, note and who it is for,
// with the price read-only — the venue's price of that dish (the newest line's), or „Cenę ustali lokal” for a new dish
// (client-restaurant-split, FR-027). Checked here before sending, so a typo never costs a request. Keeps its own
// draft, so a board refresh never overwrites what is being typed.
export function OrderItemForm({
  item,
  guests,
  tables,
  dishes,
  menu,
  pending,
  locale,
  submitLabel,
  onSubmit,
  onCancel,
}: Props) {
  const t = orderMessages(locale);
  const prices = priceMessages(locale);
  const m = menuMessages(locale);
  const formId = useId();
  const [name, setName] = useState(item?.name ?? "");
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1));
  const [note, setNote] = useState(item?.note ?? "");
  const [assignment, setAssignment] = useState(assignmentValue(item));
  const [problem, setProblem] = useState<string | null>(null);

  // What the server will charge: the line's own price while its dish keeps its name, else the dish's price.
  const ownPrice = item !== null && dishKey(name) === dishKey(item.name) ? item.unitPriceGrosze : null;
  const menuItem = menu.active ? findMenuItem(menu.items, name) : null;
  const knownPrice = ownPrice ?? menuItem?.priceGrosze ?? findDish(dishes, name)?.unitPriceGrosze ?? null;
  // An edited line from before the menu keeps its own dish as the first choice.
  const ownOffMenu = menu.active && item !== null && findMenuItem(menu.items, item.name) === null ? item.name : null;
  const priceText = knownPrice === null ? prices.byVenue : prices.fromList(formatAmount(knownPrice));

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedName = parseDishName(name, locale);
    const parsedNote = parseNote(note, locale);
    const parsedQuantity = Number(quantity);
    for (const result of [parsedName, parsedNote]) {
      if (!result.ok) {
        setProblem(result.message);
        return;
      }
    }
    if (!isValidQuantity(parsedQuantity)) {
      setProblem(quantityMessage(locale));
      return;
    }
    if (menu.active && menuItem === null && (item === null || dishKey(name) !== dishKey(item.name))) {
      setProblem(m.notOnMenu);
      return;
    }
    setProblem(null);
    // A dish already on the order keeps its spelling, so the prep list shows one line for it — except when an edit
    // only changes the spelling of the line's own dish.
    const known = item !== null && dishKey(name) === dishKey(item.name) ? null : (menuItem ?? findDish(dishes, name));
    const saved = await onSubmit({
      name: known?.name ?? name,
      note,
      quantity: parsedQuantity,
      assignment: toAssignment(assignment),
    });
    if (saved && item === null) {
      // Ready for the next line for the same person or table.
      setName("");
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
          {menu.active ? m.fromMenu : t.dish}
        </label>
        {menu.active ? (
          <select
            id={`${formId}-name`}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            className={SELECT_CLASS}
            data-menu-select
          >
            <option value="">{m.chooseDish}</option>
            {ownOffMenu !== null && <option value={ownOffMenu}>{ownOffMenu}</option>}
            {groupByCourse(menu.items).map((group) => (
              <optgroup key={group.course ?? "other"} label={courseLabel(group.course, locale)}>
                {group.items.map((dish) => (
                  <option key={dish.name} value={dish.name}>
                    {`${dish.name} — ${formatAmount(dish.priceGrosze)}`}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        ) : (
          <>
            <Input
              id={`${formId}-name`}
              list={`${formId}-dishes`}
              autoComplete="off"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              className="h-10"
            />
            <datalist id={`${formId}-dishes`}>
              {dishes.map((dish) => (
                <option key={dish.name} value={dish.name} />
              ))}
            </datalist>
          </>
        )}
      </div>
      <div className="flex flex-col gap-1 sm:col-span-2">
        <span className="text-sm font-medium">{t.unitPrice}</span>
        <p aria-live="polite" className="flex min-h-10 items-center text-sm" data-price>
          {priceText}
        </p>
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
