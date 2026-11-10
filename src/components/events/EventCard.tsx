import { useId, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EventLinkRow } from "@/components/events/EventLinkRow";
import { TvRoomLinks } from "@/components/tv/TvRoomLinks";
import { useEventCard, type EventCardStatus, type EventDetailsPatch } from "@/components/hooks/useEventCard";
import { formatEventDate } from "@/lib/events/dates";
import { eventInputProblemText, eventPanelMessages } from "@/lib/events/messages";
import {
  EVENT_DATE_MAX,
  EVENT_DATE_MIN,
  EVENT_LINK_KINDS,
  EVENT_NAME_MAX,
  EXPECTED_GUESTS_MAX,
  canDeleteEvents,
  expectedGuestsFromField,
  validateEventInput,
} from "@/lib/events/rules";
import type { Locale } from "@/lib/i18n";
import { leadMessages } from "@/lib/lead/messages";
import { cn } from "@/lib/utils";
import type { EventCardDto } from "@/types";

interface Props {
  initial: EventCardDto;
  role: "owner" | "manager" | "waiter";
  // This request's origin: the links are built from it (https behind the Lambda proxy).
  origin: string;
  locale: Locale;
}

function StatusLine({ status }: { status: EventCardStatus | null }) {
  if (!status) {
    return null;
  }
  return (
    <p role={status.error ? "alert" : "status"} className={cn("text-sm", status.error && "text-destructive")}>
      {status.text}
    </p>
  );
}

interface DetailsProps {
  card: EventCardDto;
  pending: boolean;
  status: EventCardStatus | null;
  onSave: (patch: EventDetailsPatch) => void;
  locale: Locale;
}

// Name, date and expected guests; checked with the server's rules first. Re-mounted (key) when the card changes, so
// the fields always start from the saved values.
function EventDetailsForm({ card, pending, status, onSave, locale }: DetailsProps) {
  const t = eventPanelMessages(locale);
  const id = useId();
  const [name, setName] = useState(card.name);
  const [date, setDate] = useState(card.date);
  const [guests, setGuests] = useState(card.expectedGuests === null ? "" : String(card.expectedGuests));
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const expectedGuests = expectedGuestsFromField(guests);
    const input = validateEventInput({ name, date, expectedGuests });
    if (!input.ok) {
      setProblem(eventInputProblemText(input.problem, locale));
      return;
    }
    setProblem(null);
    onSave({ name: input.value.name ?? name, date: input.value.date ?? date, expectedGuests });
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-4 rounded-xl border p-4 sm:p-6">
      <h2 id={`${id}-heading`} className="text-xl font-semibold">
        {t.detailsHeading}
      </h2>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-name`} className="font-medium">
            {t.nameLabel}
          </label>
          <Input
            id={`${id}-name`}
            type="text"
            autoComplete="off"
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
        {problem && (
          <p role="alert" className="text-destructive text-sm">
            {problem}
          </p>
        )}
        <Button type="submit" className="h-10 self-start" disabled={pending}>
          {pending ? t.saving : t.saveDetails}
        </Button>
        <StatusLine status={status} />
      </form>
    </section>
  );
}

// The event card (restaurant-events, S-11; US-06, FR-025): what the event is, its three links to copy, open and
// replace, the details form, archive / restore and — owners only — the permanent delete.
export function EventCard({ initial, role, origin, locale }: Props) {
  const t = eventPanelMessages(locale);
  const id = useId();
  const { card, gone, pending, status, patch, rotate, remove } = useEventCard(initial, locale);
  const lead = leadMessages(locale);
  const statusOf = (scope: EventCardStatus["scope"]) => (status?.scope === scope ? status : null);

  if (gone) {
    return (
      <section role="alert" className="flex flex-col gap-3 rounded-xl border p-4 sm:p-6">
        <p>{t.gone}</p>
        <a
          href={`/panel/restauracje/${String(card.restaurantId)}`}
          className="self-start underline-offset-4 hover:underline"
        >
          {t.backTo(card.restaurantName)}
        </a>
      </section>
    );
  }

  function toggleArchive() {
    const archiving = !card.archived;
    const question = archiving ? t.confirmArchive(card.name) : t.confirmRestore(card.name);
    if (window.confirm(question)) {
      void patch("archive", { archived: archiving }, archiving ? t.archived : t.restored);
    }
  }

  // „Lokal prowadzi” (client-restaurant-split, S-14): the confirm says who loses editing.
  function toggleLead() {
    const turningOn = !card.venueLeads;
    if (window.confirm(turningOn ? lead.confirmOn : lead.confirmOff)) {
      void patch("lead", { venueLeads: turningOn }, turningOn ? lead.stateOn : lead.stateOff);
    }
  }

  function deleteEvent() {
    if (window.confirm(t.confirmDelete(card.name))) {
      void remove();
    }
  }

  return (
    <div className="flex flex-col gap-6" data-event-card={card.id}>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold break-words">{card.name}</h1>
        <p>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-sm",
              !card.archived && card.timing === "today" && "bg-primary text-primary-foreground",
            )}
            data-event-status={card.archived ? "archived" : card.timing}
          >
            {card.archived ? t.archivedBadge : t.timingLabels[card.timing]}
          </span>
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t.dateField}</dt>
          <dd>{formatEventDate(card.date, locale)}</dd>
          <dt className="text-muted-foreground">{t.expectedField}</dt>
          <dd>{card.expectedGuests === null ? t.expectedUnknown : String(card.expectedGuests)}</dd>
          <dt className="text-muted-foreground">{t.guestListField}</dt>
          <dd>{card.guestCount}</dd>
        </dl>
      </header>

      <section
        aria-labelledby={`${id}-lead`}
        className="flex flex-col gap-3 rounded-xl border p-4 sm:p-6"
        data-venue-leads={String(card.venueLeads)}
      >
        <h2 id={`${id}-lead`} className="text-xl font-semibold">
          {lead.switchHeading}
        </h2>
        <p className="text-sm">
          <span className="font-medium">{card.venueLeads ? lead.stateOn : lead.stateOff}</span>
          {" — "}
          <span className="text-muted-foreground">{card.venueLeads ? lead.venueLeads : lead.clientLeads}</span>
        </p>
        <Button
          type="button"
          variant={card.venueLeads ? "outline" : "default"}
          className="h-10 self-start"
          disabled={pending !== null}
          onClick={toggleLead}
        >
          {pending === "lead" ? lead.switching : card.venueLeads ? lead.turnOff : lead.turnOn}
        </Button>
        <StatusLine status={statusOf("lead")} />
      </section>

      <section aria-labelledby={`${id}-links`} className="flex flex-col gap-4 rounded-xl border p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 id={`${id}-links`} className="text-xl font-semibold">
            {t.linksHeading}
          </h2>
          <p className="text-muted-foreground text-sm">{t.linksIntro}</p>
        </div>
        <ul className="flex flex-col gap-6">
          {EVENT_LINK_KINDS.map((kind) => (
            <EventLinkRow
              key={kind}
              kind={kind}
              path={card.links[kind]}
              origin={origin}
              eventName={card.name}
              disabled={pending !== null}
              status={statusOf(kind)}
              onRotate={() => void rotate(kind, t.links[kind].rotated)}
              locale={locale}
            />
          ))}
        </ul>
        {/* tv-room-rotation (S-20): one TV link per room, following the current TV link. */}
        <TvRoomLinks tvUrl={new URL(card.links.tv, origin).href} rooms={card.rooms} locale={locale} />
      </section>

      <EventDetailsForm
        key={`${card.name}|${card.date}|${String(card.expectedGuests)}`}
        card={card}
        pending={pending === "details"}
        status={statusOf("details")}
        onSave={(details) => void patch("details", details, t.detailsSaved)}
        locale={locale}
      />

      <section aria-labelledby={`${id}-archive`} className="flex flex-col gap-3 rounded-xl border p-4 sm:p-6">
        <h2 id={`${id}-archive`} className="text-xl font-semibold">
          {t.archiveHeading}
        </h2>
        <p className="text-muted-foreground text-sm">{card.archived ? t.archivedHint : t.archiveHint}</p>
        <Button
          type="button"
          variant="outline"
          className="h-10 self-start"
          disabled={pending !== null}
          onClick={toggleArchive}
        >
          {card.archived ? t.restore : t.archive}
        </Button>
        <StatusLine status={statusOf("archive")} />
      </section>

      {canDeleteEvents(role) && (
        <section
          aria-labelledby={`${id}-delete`}
          className="border-destructive/50 flex flex-col gap-3 rounded-xl border p-4 sm:p-6"
        >
          <h2 id={`${id}-delete`} className="text-destructive text-xl font-semibold">
            {t.deleteHeading}
          </h2>
          <p className="text-muted-foreground text-sm">{t.deleteHint}</p>
          <Button
            type="button"
            variant="destructive"
            className="h-10 self-start"
            disabled={pending !== null}
            onClick={deleteEvent}
          >
            {pending === "delete" ? t.deleting : t.deleteButton}
          </Button>
          <StatusLine status={statusOf("delete")} />
        </section>
      )}
    </div>
  );
}
