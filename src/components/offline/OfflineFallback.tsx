import { useCallback, useRef, useState } from "react";
import { useOfflineCache } from "@/components/hooks/offline-cache-store";
import { formatSavedAt, latestSavedAt } from "@/lib/offline/readout";
import { OfflineNotice } from "./OfflineNotice";
import { OfflineReadoutDialog } from "./OfflineReadoutDialog";

interface Props {
  apiBase: string;
  offline: boolean;
}

// The in-page offline fallback of an organizer page (S-09): the notice while the server cannot be reached and the
// full-screen readout of the last saved state it opens. The dialog stays open when the network comes back.
export function OfflineFallback({ apiBase, offline }: Props) {
  const cache = useOfflineCache(apiBase);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);

  const savedAt = cache ? latestSavedAt(cache.seating?.savedAt ?? null, cache.guesses?.savedAt ?? null) : null;
  const savedAtLabel = savedAt === null ? null : formatSavedAt(savedAt, new Date());

  const close = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => opener.current?.focus(), 0);
  }, []);

  return (
    <>
      <OfflineNotice
        offline={offline}
        savedAtLabel={savedAtLabel}
        buttonRef={opener}
        onOpen={() => {
          setOpen(true);
        }}
      />
      {open && <OfflineReadoutDialog apiBase={apiBase} offline={offline} onClose={close} />}
    </>
  );
}
