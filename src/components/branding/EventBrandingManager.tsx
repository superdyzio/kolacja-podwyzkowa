import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useBrandingApi } from "@/components/hooks/useBrandingApi";
import { brandingMessages } from "@/lib/branding/messages";
import { logoUrl } from "@/lib/branding/rules";
import type { Locale } from "@/lib/i18n/locale";
import type { BrandingDto } from "@/types";
import { LogoField } from "./LogoField";
import { parseBranding } from "./parse";

// „Marka wydarzenia” (event-branding, S-18, FR-032): the client's company or event name and logo, next to the venue's
// brand. `apiBase` is the client's link API (/api/o/<key>) or the panel dispatcher (/api/panel/events/<id>/klient),
// so the lead rule decides who writes (the page wraps the island in the read-only frame when it is not this side's
// turn). One action at a time; every answer replaces the brand.
interface Props {
  apiBase: string;
  initial: BrandingDto;
  locale: Locale;
}

export function EventBrandingManager({ apiBase, initial, locale }: Props) {
  const t = brandingMessages(locale);
  const base = `${apiBase}/branding`;
  const { branding, pending, failure, saved, send } = useBrandingApi(initial, parseBranding, locale);
  const [name, setName] = useState(initial.client.name ?? "");
  const logoSrc = branding.client.logo ? logoUrl(base, "event", branding.client.logo.version) : null;

  return (
    <div className="flex flex-col gap-4" data-event-branding-editor>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send(base, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name.trim() === "" ? null : name }),
          });
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="font-medium">{t.brandNameLabel}</span>
          <input
            type="text"
            value={name}
            maxLength={120}
            onChange={(event) => {
              setName(event.currentTarget.value);
            }}
            className="h-10 rounded-md border px-3"
          />
        </label>
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? t.saving : t.save}
        </Button>
      </form>
      <LogoField
        src={logoSrc}
        alt={t.logoAlt(branding.client.name ?? branding.restaurant.name)}
        disabled={pending}
        locale={locale}
        onUpload={(file) => void send(`${base}/logo`, { method: "PUT", body: file })}
        onRemove={() => void send(`${base}/logo`, { method: "DELETE" })}
      />
      <p aria-live="polite" className="text-sm">
        {failure ? <span className="text-destructive">{failure.message}</span> : saved ? t.saved : null}
      </p>
    </div>
  );
}
