import { useId, useRef, useState, type SubmitEvent } from "react";
import { useEventWaiters } from "@/components/hooks/useEventWaiters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { eventWaiterMessages } from "@/lib/event-waiters/messages";
import { WAITER_ENTRY_PATH } from "@/lib/event-waiters/paths";
import { parseWaiterName, WAITER_NAME_MAX_LENGTH } from "@/lib/event-waiters/rules";
import type { Locale } from "@/lib/i18n";
import { formatSupportTime } from "@/lib/support/format";
import type { EventWaiterIssuedDto, EventWaitersDto } from "@/types";

interface Props {
  eventId: number;
  initial: EventWaitersDto;
  // This request's origin: the link and the entry page are built from it (https behind the Lambda proxy).
  origin: string;
  locale: Locale;
}

// „Kelnerzy na imprezę” (event-waiter-access, S-21b; FR-023): owners and managers add a waiter for this one event (a
// name) and get its one-time link and code ONCE, list who was added (status, valid until) and revoke access. Times are
// shown in the platform's time zone (Europe/Warsaw) by the same formatter on the server and in the browser.
export function EventWaitersManager({ eventId, initial, origin, locale }: Props) {
  const t = eventWaiterMessages(locale);
  const id = useId();
  const { list, pending, failure, add, revoke, dismissFailure } = useEventWaiters(eventId, initial, locale);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [issued, setIssued] = useState<EventWaiterIssuedDto | null>(null);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseWaiterName(name);
    if (!parsed.ok) {
      setProblem(parsed.problem === "empty" ? t.nameEmpty : t.nameTooLong(WAITER_NAME_MAX_LENGTH));
      return;
    }
    setProblem(null);
    const credentials = await add(parsed.name);
    if (credentials) {
      setIssued(credentials);
      setName("");
    }
  }

  function confirmRevoke(waiterId: number, waiterName: string) {
    if (window.confirm(t.confirmRevoke(waiterName))) {
      void revoke(waiterId).then((done) => {
        if (done && issued?.id === waiterId) {
          setIssued(null);
        }
      });
    }
  }

  return (
    <div className="flex flex-col gap-4" data-event-waiters-manager>
      {failure && (
        <div role="alert" className="border-destructive/40 bg-destructive/10 flex flex-col gap-2 rounded-md border p-3">
          <p className="text-sm">{failure.message}</p>
          <Button type="button" variant="ghost" className="h-9 self-start" onClick={dismissFailure}>
            {t.dismiss}
          </Button>
        </div>
      )}
      {list.canAdd ? (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => void submit(event)}
          noValidate
        >
          <div className="flex flex-1 flex-col gap-2">
            <label htmlFor={`${id}-name`} className="font-medium">
              {t.nameLabel}
            </label>
            <Input
              id={`${id}-name`}
              type="text"
              autoComplete="off"
              value={name}
              maxLength={WAITER_NAME_MAX_LENGTH}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </div>
          <Button type="submit" className="h-10" disabled={pending}>
            {t.addButton}
          </Button>
        </form>
      ) : (
        <p className="bg-muted rounded-md border p-3 text-sm" data-waiters-closed>
          {t.closed}
        </p>
      )}
      {problem && (
        <p role="alert" className="text-destructive text-sm">
          {problem}
        </p>
      )}
      {issued && (
        <div aria-live="polite">
          <IssuedCard
            issued={issued}
            origin={origin}
            locale={locale}
            onDismiss={() => {
              setIssued(null);
            }}
          />
        </div>
      )}
      {list.waiters.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t.empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">{t.listHeading(list.waiters.length)}</h3>
          <ul className="flex flex-col gap-2">
            {list.waiters.map((waiter) => (
              <li
                key={waiter.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                data-event-waiter={waiter.id}
                data-waiter-status={waiter.status}
              >
                <div className="flex flex-col">
                  <span className="font-medium">{waiter.name}</span>
                  <span className="text-muted-foreground text-sm">
                    {t.status[waiter.status]} · {t.validUntil(formatSupportTime(waiter.expiresAt, locale))}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9"
                  disabled={pending}
                  aria-label={t.revokeFor(waiter.name)}
                  onClick={() => {
                    confirmRevoke(waiter.id, waiter.name);
                  }}
                >
                  {t.revoke}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// The new waiter's link and code, shown once, each with „Kopiuj” (a select-the-field fallback on non-secure origins).
function IssuedCard({
  issued,
  origin,
  locale,
  onDismiss,
}: {
  issued: EventWaiterIssuedDto;
  origin: string;
  locale: Locale;
  onDismiss: () => void;
}) {
  const t = eventWaiterMessages(locale);
  const id = useId();
  const linkField = useRef<HTMLInputElement>(null);
  const codeField = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const url = new URL(issued.path, origin).href;
  const entry = new URL(WAITER_ENTRY_PATH, origin).href;

  async function copy(value: string, field: HTMLInputElement | null) {
    const clipboard = navigator.clipboard as Clipboard | undefined;
    try {
      if (!clipboard) {
        throw new Error("no clipboard");
      }
      await clipboard.writeText(value);
      setStatus(t.copied);
    } catch {
      field?.select();
      setStatus(t.copySelected);
    }
  }

  return (
    <div className="border-primary/40 bg-primary/5 flex flex-col gap-2 rounded-lg border p-3" data-waiter-issued>
      <p className="font-medium">{t.issuedHeading(issued.name)}</p>
      <label htmlFor={`${id}-link`} className="text-sm">
        {t.issuedLinkLabel}
      </label>
      <input
        id={`${id}-link`}
        ref={linkField}
        type="text"
        readOnly
        value={url}
        onFocus={(event) => {
          event.currentTarget.select();
        }}
        className="bg-background w-full rounded-md border px-3 py-2 font-mono text-sm"
        data-waiter-link
      />
      <label htmlFor={`${id}-code`} className="text-sm">
        {t.issuedCodeLabel(entry)}
      </label>
      <input
        id={`${id}-code`}
        ref={codeField}
        type="text"
        readOnly
        value={issued.code}
        onFocus={(event) => {
          event.currentTarget.select();
        }}
        className="bg-background w-full rounded-md border px-3 py-2 font-mono text-lg tracking-wider"
        data-waiter-code
      />
      <p className="text-sm">{t.issuedValidUntil(formatSupportTime(issued.expiresAt, locale))}</p>
      <p className="text-muted-foreground text-sm">{t.issuedOnlyNow}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-10" onClick={() => void copy(url, linkField.current)}>
          {t.copyLink}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10"
          onClick={() => void copy(issued.code, codeField.current)}
        >
          {t.copyCode}
        </Button>
        <Button type="button" variant="ghost" className="h-10" onClick={onDismiss}>
          {t.dismiss}
        </Button>
      </div>
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
    </div>
  );
}
