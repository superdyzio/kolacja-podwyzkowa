import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useBrandingApi } from "@/components/hooks/useBrandingApi";
import { brandingMessages } from "@/lib/branding/messages";
import { brandStyle, parseBrandColor, restaurantLogoUrl } from "@/lib/branding/rules";
import type { Locale } from "@/lib/i18n/locale";
import { RESTAURANT_NAME_MAX } from "@/lib/platform/rules";
import type { RestaurantBrandingDto } from "@/types";
import { LogoField } from "./LogoField";
import { parseRestaurantBranding } from "./parse";

// „Marka lokalu” for the owner (event-branding, S-18, FR-032): the restaurant's name, brand colour and logo, with a
// preview of the header guests see. One action at a time; every answer replaces the brand.
interface Props {
  initial: RestaurantBrandingDto;
  locale: Locale;
}

export function RestaurantBrandingManager({ initial, locale }: Props) {
  const t = brandingMessages(locale);
  const base = `/api/panel/restaurants/${String(initial.restaurantId)}/branding`;
  const { branding, pending, failure, saved, send } = useBrandingApi(initial, parseRestaurantBranding, locale);
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState(initial.color ?? "");
  const [colorProblem, setColorProblem] = useState(false);
  const picked = parseBrandColor(color);
  const logoSrc = branding.logo ? restaurantLogoUrl(base, branding.logo.version) : null;

  return (
    <div className="flex flex-col gap-4" data-restaurant-branding-editor>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!picked.ok) {
            setColorProblem(true);
            return;
          }
          setColorProblem(false);
          void send(base, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, color: picked.color }),
          });
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="font-medium">{t.nameLabel}</span>
          <input
            type="text"
            value={name}
            maxLength={RESTAURANT_NAME_MAX}
            required
            onChange={(event) => {
              setName(event.currentTarget.value);
            }}
            className="h-10 rounded-md border px-3"
          />
        </label>
        <div className="flex flex-col gap-1">
          <label htmlFor="brand-color-text" className="font-medium">
            {t.colorLabel}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="color"
              aria-label={t.colorLabel}
              value={picked.ok && picked.color ? picked.color : "#ffffff"}
              onChange={(event) => {
                setColor(event.currentTarget.value);
              }}
              className="h-10 w-14 cursor-pointer rounded-md border"
            />
            <input
              id="brand-color-text"
              type="text"
              value={color}
              placeholder="#1e3a8a"
              aria-invalid={colorProblem || undefined}
              onChange={(event) => {
                setColor(event.currentTarget.value);
              }}
              className="h-10 w-32 rounded-md border px-3 font-mono"
            />
            <button
              type="button"
              className="hover:bg-accent h-10 rounded-md border px-3 text-sm"
              onClick={() => {
                setColor("");
              }}
            >
              {t.colorNone}
            </button>
          </div>
          <p className="text-muted-foreground text-sm">{colorProblem ? t.colorInvalid : t.colorHint}</p>
        </div>
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? t.saving : t.save}
        </Button>
      </form>

      <LogoField
        src={logoSrc}
        alt={t.logoAlt(branding.name)}
        disabled={pending}
        locale={locale}
        onUpload={(file) => void send(`${base}/logo`, { method: "PUT", body: file })}
        onRemove={() => void send(`${base}/logo`, { method: "DELETE" })}
      />

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t.preview}</span>
        <div
          className="flex items-center gap-3 rounded-xl border px-3 py-2"
          style={styleOf(branding.color, branding.textColor)}
          data-brand-preview
        >
          {logoSrc && <img src={logoSrc} alt="" className="h-10 w-auto max-w-[40%] object-contain" />}
          <span className="font-semibold">{branding.name}</span>
        </div>
      </div>

      <p aria-live="polite" className="text-sm">
        {failure ? <span className="text-destructive">{failure.message}</span> : saved ? t.saved : null}
      </p>
    </div>
  );
}

function styleOf(color: string | null, textColor: string | null): React.CSSProperties | undefined {
  return brandStyle(color, textColor) && color && textColor ? { backgroundColor: color, color: textColor } : undefined;
}
