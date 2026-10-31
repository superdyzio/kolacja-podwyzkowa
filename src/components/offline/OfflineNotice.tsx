import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { OFFLINE_NOTICE } from "@/lib/offline/readout";

interface Props {
  offline: boolean;
  // „Stan z 21:34” of the newest saved part, null when nothing is saved on this device.
  savedAtLabel: string | null;
  onOpen: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}

// The organizer's offline notice (S-09): the server cannot be reached; the hotspot hint and a way to the last saved
// state. Nothing while online (also in the server render).
export function OfflineNotice({ offline, savedAtLabel, onOpen, buttonRef }: Props) {
  if (!offline) {
    return null;
  }
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-lg border border-amber-500/60 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <p className="font-medium">{OFFLINE_NOTICE}</p>
      {savedAtLabel && <p>Ostatni zapisany stan na tym urządzeniu: {savedAtLabel}.</p>}
      <Button ref={buttonRef} type="button" variant="outline" className="h-11 self-start" onClick={onOpen}>
        Pokaż ostatni zapisany stan
      </Button>
    </div>
  );
}
