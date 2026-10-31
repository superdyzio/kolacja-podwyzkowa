import { useSyncExternalStore } from "react";
import { useOfflineSync } from "@/components/hooks/useOfflineSync";
import { Button } from "@/components/ui/button";
import { OfflineReadout } from "./OfflineReadout";

interface Props {
  // Organizer API base, e.g. "/api/o/<key>".
  apiBase: string;
  // This page's own path, "/o/<key>/odczyt".
  readoutPath: string;
}

const noSubscription = () => () => undefined;

function reload() {
  window.location.reload();
}

// The offline readout page island (S-09, NFR-004). Opened on purpose it shows the saved state and keeps it fresh. The
// organizer's service worker also serves this page in place of any organizer page that cannot be loaded; then the
// address is another page's („fallback”): it starts as offline, offers „Spróbuj ponownie”, and says when the server
// can be reached again.
export function OfflineReadoutPage({ apiBase, readoutPath }: Props) {
  const { status } = useOfflineSync(apiBase);
  // False in the server render and during hydration.
  const fallback = useSyncExternalStore(
    noSubscription,
    () => window.location.pathname.replace(/\/$/, "") !== readoutPath,
    () => false,
  );
  const offline = fallback ? status !== "online" : status === "offline";

  return (
    <div className="flex flex-col gap-6">
      {fallback &&
        (status === "online" ? (
          <div role="status" className="flex flex-col gap-2 rounded-lg border p-3">
            <p className="font-medium">Połączenie wróciło.</p>
            <Button type="button" className="h-11 self-start" onClick={reload}>
              Odśwież stronę
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
            <p>Ta strona nie otworzyła się bez połączenia — poniżej ostatni zapisany stan.</p>
            <Button type="button" variant="outline" className="h-11 self-start" onClick={reload}>
              Spróbuj ponownie
            </Button>
          </div>
        ))}
      <OfflineReadout apiBase={apiBase} offline={offline} />
    </div>
  );
}
