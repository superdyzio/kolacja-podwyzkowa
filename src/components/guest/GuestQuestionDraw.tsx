import { useGuestState } from "@/components/hooks/useGuestState";
import { QuestionDrawPanel } from "@/components/questions/QuestionDrawPanel";
import { guestPhoneMessages } from "@/lib/guest-links/messages";
import type { Locale } from "@/lib/i18n";
import { GUEST_DRAW_STORAGE_KEY } from "@/lib/questions/draw-memory";
import type { GuestStateDto } from "@/types";

interface Props {
  // Guest API base, e.g. "/api/g/<key>".
  apiBase: string;
  initial: GuestStateDto;
  locale: Locale;
}

// The guest's question draw on the phone (S-07, US-03, FR-015): a question from the chosen category (or all), seen
// only on this phone — never on the TV or anyone else's screen. Reads the page's shared live state (one poll per
// phone) only to hide itself when access is gone; a draw refused with 404 asks that state to refresh now.
export function GuestQuestionDraw({ apiBase, initial, locale }: Props) {
  const { state, refresh } = useGuestState(apiBase, initial);
  if (!state) {
    return null;
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">{guestPhoneMessages(locale).onlyYouSeeQuestion}</p>
      <QuestionDrawPanel
        drawUrl={`${apiBase}/questions/draw`}
        storageKey={GUEST_DRAW_STORAGE_KEY}
        onNoAccess={refresh}
        locale={locale}
      />
    </div>
  );
}
