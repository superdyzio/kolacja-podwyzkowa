import { useId, useState, type SubmitEvent } from "react";
import { networkFailure, readJson, toFailure } from "@/components/hooks/api-failure";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAmount, formatAmountInput } from "@/lib/guesses/amount";
import type { Locale } from "@/lib/i18n";
import { menuMessages } from "@/lib/menu/messages";
import { courseLabel, groupByCourse, MENU_COURSES, parseMenuItemInput } from "@/lib/menu/rules";
import type { MenuCatalogDto, MenuCourse, MenuItemDto } from "@/types";

const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-10 min-w-0 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]";

interface Values {
  name: string;
  course: MenuCourse;
  price: string;
}

interface FormProps {
  item: MenuItemDto | null;
  pending: boolean;
  locale: Locale;
  onSubmit: (values: Values) => Promise<boolean>;
  onCancel?: () => void;
}

// One catalog item's fields (new or edited), checked with the server's rules before sending.
function MenuItemForm({ item, pending, locale, onSubmit, onCancel }: FormProps) {
  const t = menuMessages(locale);
  const id = useId();
  const [name, setName] = useState(item?.name ?? "");
  const [course, setCourse] = useState<MenuCourse>(item?.course ?? "main");
  const [price, setPrice] = useState(item ? formatAmountInput(item.priceGrosze) : "");
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseMenuItemInput({ name, course, price }, locale);
    if (!parsed.ok) {
      setProblem(parsed.message);
      return;
    }
    setProblem(null);
    const saved = await onSubmit({ name: parsed.value.name, course, price });
    if (saved && item === null) {
      setName("");
      setPrice("");
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="grid grid-cols-2 gap-3 sm:grid-cols-6"
      aria-label={item ? t.editLabel(item.name) : t.addHeading}
    >
      <div className="col-span-2 flex flex-col gap-1 sm:col-span-3">
        <label htmlFor={`${id}-name`} className="text-sm font-medium">
          {t.name}
        </label>
        <Input
          id={`${id}-name`}
          autoComplete="off"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          className="h-10"
        />
      </div>
      <div className="flex flex-col gap-1 sm:col-span-2">
        <label htmlFor={`${id}-course`} className="text-sm font-medium">
          {t.course}
        </label>
        <select
          id={`${id}-course`}
          value={course}
          onChange={(event) => {
            const next = MENU_COURSES.find((candidate) => candidate === event.target.value);
            if (next) {
              setCourse(next);
            }
          }}
          className={SELECT_CLASS}
        >
          {MENU_COURSES.map((candidate) => (
            <option key={candidate} value={candidate}>
              {t.courses[candidate]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-price`} className="text-sm font-medium">
          {t.price}
        </label>
        <Input
          id={`${id}-price`}
          inputMode="decimal"
          autoComplete="off"
          value={price}
          onChange={(event) => {
            setPrice(event.target.value);
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
          {item ? t.save : pending ? t.adding : t.add}
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
  restaurantId: number;
  initial: MenuCatalogDto;
  locale: Locale;
}

function isCatalog(data: unknown): data is MenuCatalogDto {
  return typeof data === "object" && data !== null && Array.isArray((data as Partial<MenuCatalogDto>).items);
}

// The restaurant's menu catalog (menu-catalog-courses, S-16; FR-037): owners and managers add, change and remove
// dishes and drinks with a course and a price; the list is grouped by course. One action at a time; every answer is
// the whole catalog. A 404 (no longer allowed, or the item is gone) reloads the page.
export function MenuCatalogManager({ restaurantId, initial, locale }: Props) {
  const t = menuMessages(locale);
  const [catalog, setCatalog] = useState(initial);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const base = `/api/panel/restaurants/${String(restaurantId)}/menu`;

  async function send(method: string, path: string, body?: unknown): Promise<boolean> {
    setPending(true);
    setFailure(null);
    try {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await readJson(response);
      if (response.ok && isCatalog(data)) {
        setCatalog(data);
        return true;
      }
      if (response.status === 404) {
        window.location.reload();
        return false;
      }
      setFailure(toFailure(data, locale).message);
      return false;
    } catch {
      setFailure(networkFailure(locale).message);
      return false;
    } finally {
      setPending(false);
    }
  }

  async function save(id: number, values: Values) {
    const saved = await send("PATCH", `/${String(id)}`, values);
    if (saved) {
      setEditingId(null);
    }
    return saved;
  }

  function remove(item: MenuItemDto) {
    if (window.confirm(t.confirmRemove(item.name))) {
      void send("DELETE", `/${String(item.id)}`);
    }
  }

  return (
    <div className="flex flex-col gap-6" data-menu-catalog>
      <section aria-labelledby="menu-add-heading" className="flex flex-col gap-3 rounded-xl border p-4 sm:p-6">
        <h2 id="menu-add-heading" className="text-xl font-semibold">
          {t.addHeading}
        </h2>
        <MenuItemForm item={null} pending={pending} locale={locale} onSubmit={(values) => send("POST", "", values)} />
      </section>
      {failure && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {failure}
        </p>
      )}
      {catalog.items.length === 0 ? (
        <p className="text-muted-foreground">{t.empty}</p>
      ) : (
        groupByCourse(catalog.items).map((group) => (
          <section
            key={group.course ?? "other"}
            aria-label={courseLabel(group.course, locale)}
            className="flex flex-col gap-2"
            data-course={group.course ?? "other"}
          >
            <h2 className="text-lg font-semibold">{courseLabel(group.course, locale)}</h2>
            <ul className="flex flex-col divide-y rounded-xl border">
              {group.items.map((item) => (
                <li key={item.id} className="flex flex-col gap-2 p-3" data-menu-item={item.id}>
                  {editingId === item.id ? (
                    <MenuItemForm
                      item={item}
                      pending={pending}
                      locale={locale}
                      onSubmit={(values) => save(item.id, values)}
                      onCancel={() => {
                        setEditingId(null);
                      }}
                    />
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{item.name}</span>
                      <span className="flex items-center gap-2">
                        <span className="whitespace-nowrap">{formatAmount(item.priceGrosze)}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          aria-label={t.editLabel(item.name)}
                          onClick={() => {
                            setEditingId(item.id);
                          }}
                        >
                          {t.edit}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          aria-label={t.removeLabel(item.name)}
                          onClick={() => {
                            remove(item);
                          }}
                        >
                          {t.remove}
                        </Button>
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
