import type { Locale } from "@/lib/i18n";
import { platformMessages } from "@/lib/platform/messages";
import type { OwnerResultDto } from "@/types";
import { StaffLinkCard } from "./StaffLinkCard";

interface Props {
  owner: OwnerResultDto;
  origin: string;
  locale: Locale;
  onDismiss: () => void;
}

// What happened to the owner after „Załóż restaurację” or „Dodaj właściciela”: their one-time invitation, or — for an
// account that already has a password — the note that the restaurant shows up after they log in. No link without a
// password = a platform administrator's account (review2-fixes: the panel never issues it one).
export function OwnerResult({ owner, origin, locale, onDismiss }: Props) {
  const t = platformMessages(locale);
  if (owner.link) {
    return (
      <StaffLinkCard link={owner.link} email={owner.email} origin={origin} locale={locale} onDismiss={onDismiss} />
    );
  }
  return (
    <p role="status" className="bg-muted rounded-lg border p-3 text-sm">
      {owner.hasPassword ? t.alreadyHasPassword(owner.email) : t.adminAccountNoLink(owner.email)}
    </p>
  );
}
