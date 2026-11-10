import { useEffect } from "react";
import type { StaffOfflineEntry, StaffReadoutScope } from "@/lib/offline/staff";
import type { StaffReadoutDto } from "@/types";
import {
  clearStaffReadout,
  saveStaffReadout,
  sweepExpiredStaffReadouts,
  useStaffReadoutEntry,
} from "./staff-offline-store";
import { forgetReadoutWorker, registerReadoutWorker } from "./offline-worker";

// The saver of a staff live page (staff-offline-readout, S-27): the kitchen tablet and both floors. Every time the
// server confirms what the page shows (`syncedAt`), the price-free copy (`data`) is saved with that time („Stan z …”);
// expired copies are swept and the scope's readout worker is registered (production, secure origins). The app's own
// denial (`denied`: a replaced link, a closed floor, a session gone) forgets this scope's copy and its worker at once.
// No scope (the client's link, the panel's previews): nothing happens. Returns the scope's saved copy (undefined
// until the browser has read it).
export function useStaffReadout(
  scope: StaffReadoutScope | null,
  data: StaffReadoutDto | null,
  syncedAt: number,
  denied: boolean,
): StaffOfflineEntry | null | undefined {
  const entry = useStaffReadoutEntry(scope ?? { area: "tablet", owner: "" });

  useEffect(() => {
    if (!scope) {
      return;
    }
    sweepExpiredStaffReadouts(new Date());
    registerReadoutWorker(scope.livePath);
  }, [scope]);

  useEffect(() => {
    if (!scope || !data || denied) {
      return;
    }
    saveStaffReadout(scope, data, new Date(syncedAt).toISOString());
  }, [scope, data, syncedAt, denied]);

  useEffect(() => {
    if (!scope || !denied) {
      return;
    }
    clearStaffReadout(scope.area, scope.owner);
    void forgetReadoutWorker(scope.livePath);
  }, [scope, denied]);

  return scope ? entry : null;
}
