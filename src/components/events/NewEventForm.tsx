import { useId, useState, type SubmitEvent } from "react";
import { networkFailure, readJson, toFailure } from "@/components/hooks/api-failure";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { eventInputProblemText, eventPanelMessages } from "@/lib/events/messages";
import {
  EVENT_DATE_MAX,
  EVENT_DATE_MIN,
  EVENT_NAME_MAX,
  EXPECTED_GUESTS_MAX,
  expectedGuestsFromField,
  validateEventInput,
} from "@/lib/events/rules";
import type { Locale } from "@/lib/i18n";
import { templateMessages } from "@/lib/templates/messages";
import type { EventCardAnswerDto, VenueTemplateSummaryDto } from "@/types";

interface Props {
  restaurantId: number;
  // venue-templates (S-15): the restaurant's venue templates; a chosen one gives the new event its room.
  templates?: Pick<VenueTemplateSummaryDto, "id" | "name">[];
  locale: Locale;
}

const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-10 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]";

// „Nowe wydarzenie” (restaurant-events, S-11): name, date and the optional expected guests → the event is created and
// the browser lands on its card, where the client's link is ready to copy (US-06: < 3 minutes). Checked here with the
// server's own rules first, so a typo never costs a round trip.
export function NewEventForm({ restaurantId, templates = [], locale }: Props) {
  const t = eventPanelMessages(locale);
  const tt = templateMessages(locale);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const id = useId();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [guests, setGuests] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const expectedGuests = expectedGuestsFromField(guests);
    const input = validateEventInput({ name, date, expectedGuests });
    if (!input.ok) {
      setProblem(eventInputProblemText(input.problem, locale));
      return;
    }
    setProblem(null);
    setPending(true);
    try {
      const response = await fetch(`/api/panel/restaurants/${String(restaurantId)}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: input.value.name,
          date: input.value.date,
          expectedGuests,
          ...(templateId === null ? {} : { templateId }),
        }),
      });
      const data = await readJson(response);
      const created = (data as Partial<EventCardAnswerDto> | null)?.event;
      if (response.status === 201 && created && typeof created.id === "number") {
        window.location.assign(`/panel/wydarzenia/${String(created.id)}`);
        return;
      }
      setProblem(toFailure(data, locale).message);
    } catch {
      setProblem(networkFailure(locale).message);
    }
    setPending(false);
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-4 rounded-xl border p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-heading`} className="text-xl font-semibold">
          {t.newHeading}
        </h2>
        <p className="text-muted-foreground text-sm">{t.newIntro}</p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)} noValidate>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-name`} className="font-medium">
            {t.nameLabel}
          </label>
          <Input
            id={`${id}-name`}
            type="text"
            autoComplete="off"
            placeholder={t.namePlaceholder}
            value={name}
            maxLength={EVENT_NAME_MAX}
            required
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-date`} className="font-medium">
              {t.dateLabel}
            </label>
            <Input
              id={`${id}-date`}
              type="date"
              min={EVENT_DATE_MIN}
              max={EVENT_DATE_MAX}
              value={date}
              required
              className="w-44"
              onChange={(event) => {
                setDate(event.target.value);
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-guests`} className="font-medium">
              {t.guestsLabel}
            </label>
            <Input
              id={`${id}-guests`}
              type="number"
              inputMode="numeric"
              min={1}
              max={EXPECTED_GUESTS_MAX}
              step={1}
              placeholder={t.guestsPlaceholder}
              value={guests}
              className="w-44"
              onChange={(event) => {
                setGuests(event.target.value);
              }}
            />
          </div>
        </div>
        {templates.length > 0 && (
          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-template`} className="font-medium">
              {tt.templateLabel}
            </label>
            <select
              id={`${id}-template`}
              value={templateId ?? ""}
              onChange={(event) => {
                setTemplateId(event.target.value === "" ? null : Number(event.target.value));
              }}
              className={`${SELECT_CLASS} self-start`}
              data-template-select
            >
              <option value="">{tt.templateNone}</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {problem && (
          <p role="alert" className="text-destructive text-sm">
            {problem}
          </p>
        )}
        <Button type="submit" className="h-10 self-start" disabled={pending}>
          {pending ? t.creating : t.createButton}
        </Button>
      </form>
    </section>
  );
}
