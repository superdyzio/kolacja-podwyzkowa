import { useOfflineSync } from "@/components/hooks/useOfflineSync";
import { OfflineFallback } from "./OfflineFallback";

interface Props {
  // Organizer API base, e.g. "/api/o/<key>".
  apiBase: string;
}

// Island for organizer pages without their own offline integration (S-09): keeps this device's saved state fresh and
// shows the offline notice with the last saved state when the server cannot be reached. Renders nothing while online.
export function OfflineSync({ apiBase }: Props) {
  const { offline } = useOfflineSync(apiBase);
  return <OfflineFallback apiBase={apiBase} offline={offline} />;
}
