import { Pin } from "lucide-react";
import { DietBadges } from "@/components/diets/DietBadges";
import type { DietTag } from "@/lib/diets/rules";
import type { Locale } from "@/lib/i18n";
import { seatingEditorMessages } from "@/lib/seating/messages";

interface Props {
  pinned?: boolean;
  absent?: boolean;
  // The other present-or-absent members of the guest's inseparable group.
  partners: string[];
  // guest-import-diets (S-23): the guest's diet and note (the client's seating editor; never a guest or the TV).
  diets?: readonly DietTag[];
  dietNote?: string | null;
  locale: Locale;
}

// Small text markers next to a name: pinned (with a pin icon — never colour alone), absent, member of a group, the diet.
export function GuestMarkers({ pinned = false, absent = false, partners, diets = [], dietNote = null, locale }: Props) {
  if (!pinned && !absent && partners.length === 0 && diets.length === 0 && dietNote === null) {
    return null;
  }
  const t = seatingEditorMessages(locale);
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
      {pinned && (
        <span className="text-primary inline-flex items-center gap-0.5 font-medium">
          <Pin aria-hidden className="size-3" />
          {t.pinned}
        </span>
      )}
      {absent && <span className="text-muted-foreground">{t.absent}</span>}
      {partners.length > 0 && (
        <span className="text-muted-foreground" title={t.together(partners.join(", "))}>
          {partners.length === 1 ? t.pair : t.group}
          <span className="sr-only">{t.withNames(partners.join(", "))}</span>
        </span>
      )}
      <DietBadges diets={diets} note={dietNote} locale={locale} />
    </span>
  );
}
