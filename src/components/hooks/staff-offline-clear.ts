import { STAFF_READOUT_PATH_PREFIXES } from "@/lib/offline/staff";
import { forgetReadoutArea } from "./offline-worker";
import { clearStaffReadout } from "./staff-offline-store";

// Logout clears (staff-offline-readout, S-27): a browser without a staff session keeps no floor copy, one without a
// waiter session no waiter-floor copy. The login page (`/logowanie`, which only renders without a session) and the
// waiter's entry page without a waiter session mark it with `data-clear-staff-readout="floor" | "waiter"`; this script
// forgets that area's saved copy and every readout worker and cache under its path. The kitchen tablet has no session:
// its copy goes with the link (a replaced key is the app's denial) or at the end of the floor window.
export function clearStaffReadoutsOnPage() {
  for (const element of document.querySelectorAll<HTMLElement>("[data-clear-staff-readout]")) {
    const area = element.dataset.clearStaffReadout;
    if (area === "floor" || area === "waiter") {
      clearStaffReadout(area);
      void forgetReadoutArea(STAFF_READOUT_PATH_PREFIXES[area]);
    }
  }
}
