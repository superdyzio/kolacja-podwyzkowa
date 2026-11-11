import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { platformMessages } from "@/lib/platform/messages";
import type { StaffLinkDto } from "@/types";

interface Props {
  link: StaffLinkDto;
  // Whose link it is (shown in the heading).
  email: string;
  // This request's origin: the link is built from it (https behind the Lambda proxy).
  origin: string;
  locale: Locale;
  onDismiss?: () => void;
}

// A one-time staff link (invitation or password reset) shown once to the person who issued it, with copy
// (platform-restaurants, S-10; meant for reuse by the team invitations of S-12). The app never sends e-mail: the issuer
// hands the link over. Only rendered after an action, so the expiry is formatted in the browser's own time zone.
export function StaffLinkCard({ link, email, origin, locale, onDismiss }: Props) {
  const t = platformMessages(locale);
  const fieldId = useId();
  const field = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const url = new URL(link.path, origin).href;
  const expires = new Date(link.expiresAt).toLocaleString(locale === "en" ? "en-GB" : "pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
  });

  async function copy() {
    // navigator.clipboard exists only on secure origins (https, localhost); elsewhere select the field instead.
    const clipboard = navigator.clipboard as Clipboard | undefined;
    try {
      if (!clipboard) {
        throw new Error("no clipboard");
      }
      await clipboard.writeText(url);
      setStatus(t.copied);
    } catch {
      field.current?.select();
      setStatus(t.copySelected);
    }
  }

  return (
    <div
      className="border-primary/40 bg-primary/5 flex flex-col gap-2 rounded-lg border p-3"
      data-staff-link={link.kind}
    >
      <p className="font-medium">{link.kind === "invite" ? t.inviteLinkFor(email) : t.resetLinkFor(email)}</p>
      <label htmlFor={fieldId} className="sr-only">
        {t.linkFieldLabel}
      </label>
      <input
        id={fieldId}
        ref={field}
        type="text"
        readOnly
        value={url}
        onFocus={(event) => {
          event.currentTarget.select();
        }}
        className="bg-background w-full rounded-md border px-3 py-2 font-mono text-sm"
      />
      <p className="text-sm">
        {t.linkValidUntil(expires)} {t.linkHandOver}
      </p>
      <p className="text-muted-foreground text-sm">{t.linkOnlyNow}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-10" onClick={() => void copy()}>
          {t.copy}
        </Button>
        {onDismiss && (
          <Button type="button" variant="ghost" className="h-10" onClick={onDismiss}>
            {t.dismiss}
          </Button>
        )}
      </div>
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
    </div>
  );
}
