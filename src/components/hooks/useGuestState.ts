import { useCallback, useState, useSyncExternalStore } from "react";
import type { GuestStateDto } from "@/types";
import { guestStateStore, type GuestStateSnapshot } from "./guest-state-store";

// Live guest state for one island on the guest's phone page (S-05, S-06). Every island of the page reads the SAME
// store (guest-state-store.ts), so the phone polls once however many sections use this hook. During SSR (and the
// hydration pass) the snapshot comes from `initial`; the store itself exists only in the browser.
//
// Returns the state (null = access is gone), `offline` after 3 failed polls, `changed` while "Nowe miejsce!" is shown
// (seat changes only), `push` to hand the store a fresher state (e.g. the guess save answer) and `refresh` to poll now.
export function useGuestState(apiBase: string, initial: GuestStateDto) {
  // The server snapshot must be the same object on every call.
  const [serverSnapshot] = useState<GuestStateSnapshot>(() => ({
    state: initial,
    offline: false,
    seatChanged: false,
  }));
  const subscribe = useCallback(
    (listener: () => void) => guestStateStore(apiBase, initial).subscribe(listener),
    [apiBase, initial],
  );
  const getSnapshot = useCallback(() => guestStateStore(apiBase, initial).getSnapshot(), [apiBase, initial]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);

  const push = useCallback(
    (state: GuestStateDto) => {
      guestStateStore(apiBase, initial).push(state);
    },
    [apiBase, initial],
  );
  const refresh = useCallback(() => {
    guestStateStore(apiBase, initial).refresh();
  }, [apiBase, initial]);

  return { state: snapshot.state, offline: snapshot.offline, changed: snapshot.seatChanged, push, refresh };
}
