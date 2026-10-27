import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { OfflineReadout } from "./OfflineReadout";

interface Props {
  apiBase: string;
  offline: boolean;
  // The host closes the dialog and returns focus to the button that opened it.
  onClose: () => void;
}

// The last saved state over any organizer page (S-09), full screen. It sits below „Czytaj od końca” (z-50), which can
// open from inside it; Escape is left to that readout, so this dialog closes only with „Zamknij”.
export function OfflineReadoutDialog({ apiBase, offline, onClose }: Props) {
  const titleId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="bg-background fixed inset-0 z-40 overflow-y-auto"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-8">
        <header className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-2xl font-bold">
            Ostatni zapisany stan
          </h2>
          <Button ref={closeButton} type="button" variant="outline" className="h-11" onClick={onClose}>
            Zamknij
          </Button>
        </header>
        <OfflineReadout apiBase={apiBase} offline={offline} />
      </div>
    </div>
  );
}
