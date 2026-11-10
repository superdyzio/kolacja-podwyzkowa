import { useId, useState, type SubmitEvent } from "react";
import { networkFailure, readJson, toFailure } from "@/components/hooks/api-failure";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/guesses/amount";
import type { Locale } from "@/lib/i18n";
import { menuMessages } from "@/lib/menu/messages";
import { courseLabel, EVENT_MENU_MODES, groupByCourse } from "@/lib/menu/rules";
import type { EventMenuDto, EventMenuMode } from "@/types";

interface Props {
  eventId: number;
  restaurantId: number;
  initial: EventMenuDto;
  locale: Locale;
}

function isEventMenu(data: unknown): data is EventMenuDto {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as Partial<EventMenuDto>).mode === "string" &&
    Array.isArray((data as Partial<EventMenuDto>).items)
  );
}

// „Menu wydarzenia” on the event card (menu-catalog-courses, S-16; FR-037): owners and managers choose what the client
// may order — no menu (free text as before), the full catalog or a reduced one (ticked items, grouped by course).
// Saving sends the whole choice; the answer replaces it. A 404 reloads the page (no longer allowed, or the event or an
// item is gone).
export function EventMenuEditor({ eventId, restaurantId, initial, locale }: Props) {
  const t = menuMessages(locale);
  const id = useId();
  const [menu, setMenu] = useState(initial);
  const [mode, setMode] = useState<EventMenuMode>(initial.mode);
  const [chosen, setChosen] = useState(
    () =>
      new Set(initial.mode === "reduced" ? initial.items.filter((item) => item.available).map((item) => item.id) : []),
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const total = menu.items.length;
  const availableCount = mode === "off" ? 0 : mode === "full" ? total : chosen.size;

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/panel/events/${String(eventId)}/menu`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, ...(mode === "reduced" ? { itemIds: [...chosen] } : {}) }),
      });
      const data = await readJson(response);
      if (response.ok && isEventMenu(data)) {
        setMenu(data);
        setMessage({ text: t.saved, error: false });
      } else if (response.status === 404) {
        window.location.reload();
      } else {
        setMessage({ text: toFailure(data, locale).message, error: true });
      }
    } catch {
      setMessage({ text: networkFailure(locale).message, error: true });
    }
    setPending(false);
  }

  function toggle(itemId: number, on: boolean) {
    setChosen((current) => {
      const next = new Set(current);
      if (on) {
        next.add(itemId);
      } else {
        next.delete(itemId);
      }
      return next;
    });
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" data-event-menu-editor>
      {total === 0 && <p className="text-muted-foreground text-sm">{t.catalogEmpty}</p>}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t.modeLegend}</legend>
        {EVENT_MENU_MODES.map((candidate) => (
          <label key={candidate} className="flex min-h-10 items-center gap-2">
            <input
              type="radio"
              name={`${id}-mode`}
              value={candidate}
              checked={mode === candidate}
              onChange={() => {
                setMode(candidate);
              }}
              className="size-4"
            />
            {t.modes[candidate]}
          </label>
        ))}
      </fieldset>
      {mode === "reduced" && total > 0 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium">{t.chooseItems}</legend>
          {groupByCourse(menu.items).map((group) => (
            <div key={group.course ?? "other"} className="flex flex-col gap-1">
              <p className="text-muted-foreground text-xs font-semibold uppercase">
                {courseLabel(group.course, locale)}
              </p>
              {group.items.map((item) => (
                <label key={item.id} className="flex min-h-9 items-center gap-2" data-menu-choice={item.id}>
                  <input
                    type="checkbox"
                    checked={chosen.has(item.id)}
                    onChange={(event) => {
                      toggle(item.id, event.target.checked);
                    }}
                    className="size-4"
                  />
                  <span>{item.name}</span>
                  <span className="text-muted-foreground text-sm">{formatAmount(item.priceGrosze)}</span>
                </label>
              ))}
            </div>
          ))}
        </fieldset>
      )}
      {mode !== "off" && (
        <p className="text-sm" aria-live="polite">
          {availableCount === 0 ? t.inactiveNote : t.availableCount(availableCount, total)}
        </p>
      )}
      {message && (
        <p role={message.error ? "alert" : "status"} className={message.error ? "text-destructive text-sm" : "text-sm"}>
          {message.text}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="h-10" disabled={pending}>
          {pending ? t.saving : t.saveMenu}
        </Button>
        <a
          href={`/panel/restauracje/${String(restaurantId)}/menu`}
          className="text-sm underline-offset-4 hover:underline"
        >
          {t.editCatalog}
        </a>
      </div>
    </form>
  );
}
