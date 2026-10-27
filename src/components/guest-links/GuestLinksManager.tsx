import { useEffect, useState } from "react";
import { useGuestLinks } from "@/components/hooks/useGuestLinks";
import { Button } from "@/components/ui/button";
import { LOCAL_ORIGIN_WARNING, guestUrl, isLocalOrigin } from "@/lib/guest-links/links";
import { formatGuestAccess } from "@/lib/guest-links/summary";
import type { GuestLinkDto, GuestLinksDto } from "@/types";

interface Props {
  // Organizer API base, e.g. "/api/o/<key>".
  apiBase: string;
  // Origin of the page request: links are built from it, so they work wherever the app is hosted.
  origin: string;
  // Print view of the cards, e.g. "/o/<key>/karteczki".
  cardsPath: string;
  // Organizer guest list page (when there are no guests yet).
  guestsPath: string;
  initial: GuestLinksDto;
}

type CopyStatus = { guestId: number; copied: boolean } | null;

const COPY_STATUS_MS = 4_000;

const TURN_OFF_QUESTION = "Wyłączyć dostęp gości? Otwarte telefony gości od razu przestaną pokazywać miejsca.";

function revokeQuestion(name: string): string {
  return `Unieważnić link „${name}”? ${name} dostanie nowy link, a stara karteczka i stary link przestaną działać od razu. Potem wydrukuj nową karteczkę.`;
}

// Organizer links page island (S-05, FR-011, FR-012): the guest-access switch, every guest's personal link with copy,
// print and revoke.
export function GuestLinksManager({ apiBase, origin, cardsPath, guestsPath, initial }: Props) {
  const { links, pending, failure, send, dismissFailure } = useGuestLinks(apiBase, initial);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>(null);
  const [revokedName, setRevokedName] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    if (!copyStatus) {
      return;
    }
    const timer = window.setTimeout(() => {
      setCopyStatus(null);
    }, COPY_STATUS_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [copyStatus]);

  async function copyLink(guest: GuestLinkDto) {
    const url = guestUrl(origin, guest.key);
    // navigator.clipboard exists only on secure origins (https, localhost); on http://<LAN IP> fall back to selecting
    // the field so the organizer can copy it by hand.
    const clipboard = navigator.clipboard as Clipboard | undefined;
    try {
      if (!clipboard) {
        throw new Error("no clipboard");
      }
      await clipboard.writeText(url);
      setCopyStatus({ guestId: guest.id, copied: true });
    } catch {
      const field = document.getElementById(`guest-link-${guest.id}`);
      if (field instanceof HTMLInputElement) {
        field.focus();
        field.select();
      }
      setCopyStatus({ guestId: guest.id, copied: false });
    }
  }

  async function toggleAccess() {
    if (links.enabled && !window.confirm(TURN_OFF_QUESTION)) {
      return;
    }
    await send({ method: "PATCH", path: "/guest-links", body: { enabled: !links.enabled } });
  }

  async function revoke(guest: GuestLinkDto) {
    if (!window.confirm(revokeQuestion(guest.displayName))) {
      return;
    }
    if (await send({ method: "POST", path: `/guest-links/${guest.id}/revoke` })) {
      setRevokedName({ id: guest.id, name: guest.displayName });
      setCopyStatus(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {isLocalOrigin(origin) && (
        <p role="note" className="rounded-lg border border-amber-500/60 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Uwaga:</strong> {LOCAL_ORIGIN_WARNING}
        </p>
      )}

      {failure && (
        <div role="alert" className="border-destructive/50 bg-destructive/5 flex flex-col gap-2 rounded-lg border p-3">
          <p className="text-destructive font-medium">{failure.message}</p>
          <Button type="button" variant="ghost" className="h-10 self-start" onClick={dismissFailure}>
            Zamknij
          </Button>
        </div>
      )}

      <section aria-labelledby="access-heading" className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 id="access-heading" className="text-lg font-semibold">
          Dostęp gości
        </h2>
        <p aria-live="polite">
          <strong>{formatGuestAccess(links.enabled)}.</strong>{" "}
          <span className="text-muted-foreground">
            {links.enabled
              ? "Goście po otwarciu linku lub zeskanowaniu karteczki widzą swój stolik i miejsce."
              : "Linki i kody QR gości pokazują tylko „Brak dostępu”. Włącz dostęp, gdy goście mają już z nich korzystać."}
          </span>
        </p>
        <Button
          type="button"
          variant={links.enabled ? "outline" : "default"}
          className="h-11 self-start"
          disabled={pending}
          onClick={() => void toggleAccess()}
        >
          {links.enabled ? "Wyłącz dostęp gości" : "Włącz dostęp gości"}
        </Button>
      </section>

      <section aria-labelledby="links-list-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="links-list-heading" className="text-lg font-semibold">
            Osobiste linki ({links.guests.length})
          </h2>
          {links.guests.length > 0 && (
            <Button asChild className="h-11">
              <a href={cardsPath}>Drukuj karteczki</a>
            </Button>
          )}
        </div>

        {revokedName && (
          <p
            role="status"
            className="rounded-lg border border-emerald-600/40 bg-emerald-50 p-3 text-sm text-emerald-900"
          >
            {revokedName.name} ma nowy link — stara karteczka już nie działa.{" "}
            <a className="font-medium underline" href={`${cardsPath}?guest=${revokedName.id}`}>
              Wydrukuj nową karteczkę
            </a>
            .
          </p>
        )}

        {links.guests.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nie ma jeszcze gości.{" "}
            <a className="underline" href={guestsPath}>
              Dodaj gości
            </a>
            , a ich linki pojawią się tutaj.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {links.guests.map((guest) => {
              const url = guestUrl(origin, guest.key);
              const status = copyStatus?.guestId === guest.id ? copyStatus : null;
              return (
                <li key={guest.id} className="flex flex-col gap-2 rounded-lg border p-3">
                  <label htmlFor={`guest-link-${guest.id}`} className="font-medium">
                    {guest.displayName}
                  </label>
                  <input
                    id={`guest-link-${guest.id}`}
                    type="text"
                    readOnly
                    value={url}
                    onFocus={(event) => {
                      event.currentTarget.select();
                    }}
                    className="bg-muted w-full rounded-md border px-3 py-2 font-mono text-xs"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" className="h-10" onClick={() => void copyLink(guest)}>
                      Kopiuj
                    </Button>
                    <Button asChild variant="outline" className="h-10">
                      <a href={`${cardsPath}?guest=${guest.id}`}>Drukuj karteczkę</a>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-destructive h-10"
                      disabled={pending}
                      onClick={() => void revoke(guest)}
                    >
                      Unieważnij link
                    </Button>
                    <span aria-live="polite" className="text-sm">
                      {status &&
                        (status.copied ? (
                          <span className="text-emerald-700">Skopiowano</span>
                        ) : (
                          <span className="text-amber-800">Zaznaczono link — skopiuj go ręcznie.</span>
                        ))}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
