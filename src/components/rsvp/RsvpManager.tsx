import { useState, type SubmitEvent } from "react";
import { useRsvpBoard } from "@/components/hooks/useRsvpBoard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime, instantToLocalInput } from "@/lib/events/dates";
import { displayNameKey } from "@/lib/guests/names";
import type { Locale } from "@/lib/i18n";
import { courseLabel, groupByCourse } from "@/lib/menu/rules";
import { rsvpMessages } from "@/lib/rsvp/messages";
import { defaultDeadlineInput, MAX_RSVP_OPTIONS } from "@/lib/rsvp/rules";
import type { RsvpBoardDto, RsvpGuestDto } from "@/types";

interface Props {
  // The client's API base: /api/o/<key> or, in the panel's preview, /api/panel/events/<id>/klient.
  apiBase: string;
  initial: RsvpBoardDto;
  // Where the client's sections live (/o/<key> or /panel/wydarzenia/<id>), for the link to „Linki gości”.
  sectionsBase: string;
  locale: Locale;
}

// The client's RSVP page (guest-rsvp-menu, S-25; FR-039, US-07), also the panel's preview: the deadline (set, close
// now, turn off), the dishes guests pick from (among what the event's menu offers), the counts and every guest's
// answer, editable at any time (also after the deadline). Every change replaces the whole board; the board is re-read
// while guests answer from their phones.
export function RsvpManager({ apiBase, initial, sectionsBase, locale }: Props) {
  const t = rsvpMessages(locale);
  const { board, pending, failure, send, dismissFailure } = useRsvpBoard(apiBase, initial, locale);
  const state = board.deadline === null ? "off" : board.open ? "open" : "closed";

  return (
    <div className="flex flex-col gap-6" data-rsvp-manager data-rsvp-state={state}>
      {failure && (
        <div role="alert" className="border-destructive/40 bg-destructive/5 flex flex-col gap-1 rounded-lg border p-3">
          <p className="text-destructive font-medium">{failure.message}</p>
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={dismissFailure}>
            {t.dismiss}
          </Button>
        </div>
      )}
      <DeadlineCard board={board} pending={pending} send={send} sectionsBase={sectionsBase} locale={locale} />
      <OptionsCard board={board} pending={pending} send={send} locale={locale} />
      <CountsCard board={board} locale={locale} />
      <AnswersCard board={board} pending={pending} send={send} locale={locale} />
    </div>
  );
}

type Send = ReturnType<typeof useRsvpBoard>["send"];

interface CardProps {
  board: RsvpBoardDto;
  pending: boolean;
  send: Send;
  locale: Locale;
}

function DeadlineCard({ board, pending, send, sectionsBase, locale }: CardProps & { sectionsBase: string }) {
  const t = rsvpMessages(locale);
  const suggestion =
    board.deadline === null ? defaultDeadlineInput(board.eventDate) : instantToLocalInput(board.deadline);
  const [draft, setDraft] = useState(suggestion);
  const [shownFor, setShownFor] = useState(board.deadline);
  // A new deadline from the server (also another device's) replaces the field's value.
  if (shownFor !== board.deadline) {
    setShownFor(board.deadline);
    setDraft(suggestion);
  }

  function setDeadline(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void send({ method: "PATCH", path: "/rsvp", body: { deadline: draft } });
  }

  const stateText =
    board.deadline === null
      ? t.stateOff
      : board.open
        ? t.stateOpen(formatDateTime(board.deadline, locale))
        : t.stateClosed(formatDateTime(board.deadline, locale));

  return (
    <section aria-labelledby="rsvp-deadline-heading" className="flex flex-col gap-3 rounded-xl border p-4 sm:p-6">
      <h2 id="rsvp-deadline-heading" className="text-xl font-semibold">
        {t.deadlineHeading}
      </h2>
      <p className="font-medium" data-rsvp-state-text>
        {stateText}
      </p>
      {!board.guestLinksOn && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-rsvp-links-off>
          {t.linksOff}{" "}
          <a className="font-medium underline underline-offset-4" href={`${sectionsBase}/linki`}>
            {t.linksPage}
          </a>
        </p>
      )}
      <form className="flex flex-wrap items-end gap-3" onSubmit={setDeadline}>
        <div className="flex flex-col gap-1">
          <label htmlFor="rsvp-deadline" className="text-sm font-medium">
            {t.deadlineLabel}
          </label>
          <Input
            id="rsvp-deadline"
            type="datetime-local"
            value={draft}
            required
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            className="w-auto"
          />
        </div>
        <Button type="submit" disabled={pending || draft === ""}>
          {t.setDeadline}
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {board.open && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (window.confirm(t.confirmClose)) {
                void send({ method: "PATCH", path: "/rsvp", body: { close: true } });
              }
            }}
          >
            {t.closeNow}
          </Button>
        )}
        {board.deadline !== null && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (window.confirm(t.confirmOff)) {
                void send({ method: "PATCH", path: "/rsvp", body: { deadline: null } });
              }
            }}
          >
            {t.turnOff}
          </Button>
        )}
      </div>
    </section>
  );
}

function OptionsCard({ board, pending, send, locale }: CardProps) {
  const t = rsvpMessages(locale);
  const savedKeys = board.options.filter((option) => option.available).map((option) => displayNameKey(option.name));
  const savedSignature = savedKeys.join("\u0001");
  const [selected, setSelected] = useState<string[]>(savedKeys);
  const [shownFor, setShownFor] = useState(savedSignature);
  if (shownFor !== savedSignature) {
    setShownFor(savedSignature);
    setSelected(savedKeys);
  }
  const offMenu = board.options.filter((option) => !option.available);
  const dirty =
    offMenu.length > 0 || selected.length !== savedKeys.length || selected.some((key) => !savedKeys.includes(key));

  function toggle(key: string, on: boolean) {
    setSelected((current) => (on ? [...current, key] : current.filter((item) => item !== key)));
  }

  function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    // In the menu's order, by the menu's spelling.
    const names = board.menu.filter((item) => selected.includes(displayNameKey(item.name))).map((item) => item.name);
    void send({ method: "PATCH", path: "/rsvp", body: { options: names } });
  }

  return (
    <section aria-labelledby="rsvp-options-heading" className="flex flex-col gap-3 rounded-xl border p-4 sm:p-6">
      <h2 id="rsvp-options-heading" className="text-xl font-semibold">
        {t.optionsHeading}
      </h2>
      {board.menu.length === 0 ? (
        <p className="text-muted-foreground text-sm" data-rsvp-menu-inactive>
          {t.menuInactive}
        </p>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={save} data-rsvp-options>
          <p className="text-muted-foreground text-sm">{t.optionsIntro}</p>
          {groupByCourse(board.menu).map((group) => (
            <fieldset key={group.course ?? "none"} className="flex flex-col gap-1">
              <legend className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {courseLabel(group.course, locale)}
              </legend>
              {group.items.map((item) => {
                const key = displayNameKey(item.name);
                const checked = selected.includes(key);
                return (
                  <label key={key} className="flex items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={checked}
                      disabled={pending || (!checked && selected.length >= MAX_RSVP_OPTIONS)}
                      data-rsvp-option={item.name}
                      onChange={(event) => {
                        toggle(key, event.target.checked);
                      }}
                    />
                    {item.name}
                  </label>
                );
              })}
            </fieldset>
          ))}
          {selected.length >= MAX_RSVP_OPTIONS && (
            <p className="text-muted-foreground text-sm">{t.optionsLimit(MAX_RSVP_OPTIONS)}</p>
          )}
          {offMenu.length > 0 && (
            <p className="text-sm text-amber-900" data-rsvp-options-off-menu>
              {t.optionsOffMenu(offMenu.map((option) => option.name).join(", "))}
            </p>
          )}
          {selected.length === 0 && <p className="text-muted-foreground text-sm">{t.noOptions}</p>}
          <Button type="submit" className="self-start" disabled={pending || !dirty}>
            {t.saveOptions}
          </Button>
        </form>
      )}
    </section>
  );
}

function CountsCard({ board, locale }: { board: RsvpBoardDto; locale: Locale }) {
  const t = rsvpMessages(locale);
  const { counts } = board;
  const tiles = [
    { key: "coming", label: t.coming, value: counts.coming },
    { key: "notComing", label: t.notComing, value: counts.notComing },
    { key: "noAnswer", label: t.noAnswerCount, value: counts.noAnswer },
  ] as const;
  return (
    <section
      aria-labelledby="rsvp-counts-heading"
      className="flex flex-col gap-3 rounded-xl border p-4 sm:p-6"
      data-rsvp-counts
    >
      <h2 id="rsvp-counts-heading" className="text-xl font-semibold">
        {t.countsHeading}
      </h2>
      <dl className="grid grid-cols-3 gap-3">
        {tiles.map((tile) => (
          <div key={tile.key} className="bg-muted flex flex-col rounded-lg p-3">
            <dt className="text-muted-foreground text-sm">{tile.label}</dt>
            <dd className="text-3xl font-bold" data-rsvp-count={tile.key}>
              {tile.value}
            </dd>
          </div>
        ))}
      </dl>
      {(counts.dishes.length > 0 || (counts.coming > 0 && board.options.length > 0)) && (
        <div className="flex flex-col gap-1">
          <h3 className="font-medium">{t.dishesHeading}</h3>
          <ul className="flex flex-col gap-1">
            {counts.dishes.map((dish) => (
              <li key={dish.name} data-rsvp-dish={dish.name} className="flex flex-wrap items-baseline gap-2">
                <span className="font-semibold tabular-nums">×{dish.count}</span>
                <span>{dish.name}</span>
                <span className="text-muted-foreground text-xs">{courseLabel(dish.course, locale)}</span>
                {!dish.offered && <span className="text-xs text-amber-900">({t.notOnList})</span>}
              </li>
            ))}
            {counts.noDish > 0 && (
              <li className="text-muted-foreground flex gap-2" data-rsvp-no-dish>
                <span className="font-semibold tabular-nums">×{counts.noDish}</span>
                <span>{t.noDish}</span>
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}

function AnswersCard({ board, pending, send, locale }: CardProps) {
  const t = rsvpMessages(locale);
  const offered = board.options.filter((option) => option.available);
  return (
    <section aria-labelledby="rsvp-answers-heading" className="flex flex-col gap-3 rounded-xl border p-4 sm:p-6">
      <h2 id="rsvp-answers-heading" className="text-xl font-semibold">
        {t.answersHeading}
      </h2>
      <p className="text-muted-foreground text-sm">{t.attendanceNote}</p>
      {board.guests.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t.noGuests}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {board.guests.map((guest) => (
            <AnswerRow key={guest.id} guest={guest} offered={offered} pending={pending} send={send} locale={locale} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AnswerRow({
  guest,
  offered,
  pending,
  send,
  locale,
}: {
  guest: RsvpGuestDto;
  offered: RsvpBoardDto["options"];
  pending: boolean;
  send: Send;
  locale: Locale;
}) {
  const t = rsvpMessages(locale);
  const attendance = guest.attending === true ? "yes" : guest.attending === false ? "no" : "none";
  const dishKnown = guest.dish === null || offered.some((option) => sameName(option.name, guest.dish ?? ""));
  const path = `/rsvp/guests/${String(guest.id)}`;
  const author = guest.attending === null ? null : guest.byOrganizer ? t.byOrganizerShort : t.byGuestShort;

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4" data-rsvp-guest={guest.id}>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{guest.displayName}</span>
        {author && (
          <span className="text-muted-foreground text-xs">
            {author}
            {guest.answeredAt && ` ${t.answeredAt(formatDateTime(guest.answeredAt, locale))}`}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          aria-label={t.attendanceLabel(guest.displayName)}
          className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
          value={attendance}
          disabled={pending}
          data-rsvp-attendance
          onChange={(event) => {
            const value = event.target.value;
            const attending = value === "yes" ? true : value === "no" ? false : null;
            void send({ method: "PUT", path, body: { attending, dish: null } });
          }}
        >
          <option value="yes">{t.optionComing}</option>
          <option value="no">{t.optionNotComing}</option>
          <option value="none">{t.optionNoAnswer}</option>
        </select>
        {guest.attending === true && (offered.length > 0 || guest.dish !== null) && (
          <select
            aria-label={t.dishSelectLabel(guest.displayName)}
            className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
            value={guest.dish ?? ""}
            disabled={pending}
            data-rsvp-dish-select
            onChange={(event) => {
              const dish = event.target.value === "" ? null : event.target.value;
              void send({ method: "PUT", path, body: { attending: true, dish } });
            }}
          >
            <option value="">{t.dishNone}</option>
            {offered.map((option) => (
              <option key={option.name} value={option.name}>
                {option.name}
              </option>
            ))}
            {!dishKnown && guest.dish !== null && (
              <option value={guest.dish} disabled>
                {guest.dish} ({t.notOnList})
              </option>
            )}
          </select>
        )}
      </div>
    </li>
  );
}

function sameName(a: string, b: string): boolean {
  return displayNameKey(a) === displayNameKey(b);
}
