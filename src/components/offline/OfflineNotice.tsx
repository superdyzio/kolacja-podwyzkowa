import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { offlineMessages } from "@/lib/offline/messages";

interface Props {
  offline: boolean;
  // „Stan z 21:34” of the newest saved part, null when nothing is saved on this device.
  savedAtLabel: string | null;
  onOpen: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
  locale: Locale;
}

// The organizer's offline notice (S-09): the server cannot be reached; the hotspot hint and a way to the last saved
// state. Nothing while online (also in the server render).
export function OfflineNotice({ offline, savedAtLabel, onOpen, buttonRef, locale }: Props) {
  if (!offline) {
    return null;
  }
  const t = offlineMessages(locale);
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-lg border border-amber-500/60 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <p className="font-medium">{t.notice}</p>
      {savedAtLabel && <p>{t.lastSaved(savedAtLabel)}</p>}
      <Button ref={buttonRef} type="button" variant="outline" className="h-11 self-start" onClick={onOpen}>
        {t.showLastSaved}
      </Button>
    </div>
  );
}
