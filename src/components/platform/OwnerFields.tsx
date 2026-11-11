import { Input } from "@/components/ui/input";
import type { Locale } from "@/lib/i18n";
import { platformMessages } from "@/lib/platform/messages";
import { OWNER_NAME_MAX } from "@/lib/platform/rules";

interface Props {
  // Prefix of the field ids (unique per form).
  idPrefix: string;
  email: string;
  name: string;
  onEmail: (value: string) => void;
  onName: (value: string) => void;
  locale: Locale;
}

// The owner's e-mail and optional name, shared by „Nowa restauracja” and „Dodaj właściciela” (platform-restaurants).
export function OwnerFields({ idPrefix, email, name, onEmail, onName, locale }: Props) {
  const t = platformMessages(locale);
  return (
    <>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${idPrefix}-email`} className="font-medium">
          {t.ownerEmailLabel}
        </label>
        <Input
          id={`${idPrefix}-email`}
          type="email"
          autoComplete="off"
          value={email}
          maxLength={254}
          required
          aria-describedby={`${idPrefix}-email-hint`}
          onChange={(event) => {
            onEmail(event.target.value);
          }}
        />
        <p id={`${idPrefix}-email-hint`} className="text-muted-foreground text-sm">
          {t.ownerEmailHint}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${idPrefix}-name`} className="font-medium">
          {t.ownerNameLabel}
        </label>
        <Input
          id={`${idPrefix}-name`}
          type="text"
          autoComplete="off"
          value={name}
          maxLength={OWNER_NAME_MAX}
          onChange={(event) => {
            onName(event.target.value);
          }}
        />
      </div>
    </>
  );
}
