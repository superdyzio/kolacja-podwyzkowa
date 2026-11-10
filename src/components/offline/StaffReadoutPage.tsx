import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { forgetReadoutWorker, registerReadoutWorker } from "@/components/hooks/offline-worker";
import {
  clearStaffReadout,
  readStaffReadout,
  saveStaffReadout,
  sweepExpiredStaffReadouts,
  useStaffReadoutEntry,
} from "@/components/hooks/staff-offline-store";
import { RestaurantBoard } from "@/components/restaurant/RestaurantBoard";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/events/dates";
import type { Locale } from "@/lib/i18n";
import { offlineMessages } from "@/lib/offline/messages";
import { formatSavedAt } from "@/lib/offline/readout";
import { readStaffReadoutOnce, type PlanAspect, type StaffReadoutScope } from "@/lib/offline/staff";
import { staffOfflineMessages } from "@/lib/offline/staff-messages";
import { describeToServe } from "@/lib/orders/summary";

interface Props {
  scope: StaffReadoutScope;
  locale: Locale;
}

// Same rhythm as the organizer's readout (useOfflineSync): every 30 s while visible, every 5 s while offline, 8 s limit.
const SYNC_MS = 30_000;
const RETRY_MS = 5_000;
const TIMEOUT_MS = 8_000;

type Status = "unknown" | "online" | "offline" | "gone";

const noSubscription = () => () => undefined;

function reload() {
  window.location.reload();
}

// The staff's offline readout page island (staff-offline-readout, S-27; FR-047, NFR-017): the last state of the
// orders (with the pieces served), the published seating and the diets saved on this device by the kitchen tablet or a
// floor of this event — read only, through the tablet's board (no prices). Its HTML carries no data: the copy comes
// from localStorage, so the readout worker can keep the page and serve it in place of a live page of the scope that
// cannot load („fallback”: the address is the live page's; it starts as offline, offers „Spróbuj ponownie”, and says
// when the server can be reached again). While it can, the page reads the live API itself and saves what it got; the
// app's denial forgets the copy and the worker at once. The copy disappears at the end of the event's floor window.
export function StaffReadoutPage({ scope, locale }: Props) {
  const t = staffOfflineMessages(locale);
  const o = offlineMessages(locale);
  const entry = useStaffReadoutEntry(scope);
  const [status, setStatus] = useState<Status>("unknown");
  // The plan's aspect ratio: measured here, else the copy's own.
  const aspect = useRef<PlanAspect>(null);
  const fallback = useSyncExternalStore(
    noSubscription,
    () => window.location.pathname.replace(/\/$/, "") !== scope.readoutPath,
    () => false,
  );

  const onAspect = useCallback((planVersion: number, ratio: number) => {
    aspect.current = { planVersion, aspect: ratio };
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    let current: Status = "unknown";

    function set(next: Status) {
      current = next;
      setStatus(next);
    }

    function schedule() {
      window.clearTimeout(timer);
      if (!stopped && !document.hidden && current !== "gone") {
        timer = window.setTimeout(() => void probe(), current === "offline" ? RETRY_MS : SYNC_MS);
      }
    }

    async function probe() {
      if (controller || current === "gone") {
        return;
      }
      window.clearTimeout(timer);
      const request = new AbortController();
      controller = request;
      const timeout = window.setTimeout(() => {
        request.abort();
      }, TIMEOUT_MS);
      try {
        sweepExpiredStaffReadouts(new Date());
        const known = aspect.current ?? readStaffReadout(scope)?.data.planAspect ?? null;
        const result = await readStaffReadoutOnce(scope, known, (input, init) => fetch(input, init), request.signal);
        if (stopped) {
          return;
        }
        if (result.status === "ok") {
          saveStaffReadout(scope, result.data, new Date().toISOString());
          set("online");
        } else if (result.status === "gone") {
          clearStaffReadout(scope.area, scope.owner);
          void forgetReadoutWorker(scope.livePath);
          set("gone");
        } else {
          set("offline");
        }
      } finally {
        window.clearTimeout(timeout);
        controller = null;
        schedule();
      }
    }

    function onVisibilityChange() {
      window.clearTimeout(timer);
      if (!document.hidden) {
        void probe();
      }
    }

    function onOnline() {
      void probe();
    }

    function onOffline() {
      if (current !== "gone") {
        set("offline");
        schedule();
      }
    }

    registerReadoutWorker(scope.livePath);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    void probe();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [scope]);

  const offline = fallback ? status !== "online" : status === "offline";
  const data = entry?.data;
  const savedAspect =
    data?.planAspect?.planVersion === data?.seating.planVersion ? data?.planAspect?.aspect : undefined;

  return (
    <div className="flex flex-col gap-6">
      {fallback &&
        status !== "gone" &&
        (status === "online" ? (
          <div role="status" className="flex flex-col gap-2 rounded-lg border p-3">
            <p className="font-medium">{o.reconnected}</p>
            <Button type="button" className="h-11 self-start" onClick={reload}>
              {o.reload}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
            <p>{o.fallbackText}</p>
            <Button type="button" variant="outline" className="h-11 self-start" onClick={reload}>
              {o.retry}
            </Button>
          </div>
        ))}
      {status === "gone" ? (
        <p role="alert" className="rounded-lg border p-3" data-staff-readout-state="gone">
          {t.gone}
        </p>
      ) : entry === undefined ? (
        <p className="text-muted-foreground">{t.loading}</p>
      ) : entry === null || !data ? (
        <p className="rounded-lg border p-3" data-staff-readout-state="empty">
          {t.noState}
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-1" data-staff-readout-state="saved" aria-live="polite">
            <p className="text-lg font-semibold">{formatSavedAt(entry.savedAt, new Date(), locale)}</p>
            <p className="text-lg font-medium">{describeToServe(data.totals.toServe, data.totals.quantity, locale)}</p>
            <p className="text-muted-foreground text-sm">{t.expires(formatDateTime(entry.expiresAt, locale))}</p>
            {offline && (
              <p role="status" className="self-start rounded-md bg-amber-500/15 px-2 py-1 text-sm">
                {o.readoutBanner}
              </p>
            )}
          </section>
          <RestaurantBoard
            view={data}
            apiBase={scope.apiBase}
            locale={locale}
            fallbackAspect={savedAspect}
            onAspect={onAspect}
          />
        </>
      )}
    </div>
  );
}
