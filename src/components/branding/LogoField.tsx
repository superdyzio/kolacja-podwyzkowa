import { useId } from "react";
import { brandingMessages } from "@/lib/branding/messages";
import type { Locale } from "@/lib/i18n/locale";

// The logo part of a brand editor (event-branding, S-18): the current logo (if any), a file picker that uploads at
// once (the server sniffs the type and caps the size) and „Usuń logo” after a confirm.
interface Props {
  src: string | null;
  alt: string;
  disabled: boolean;
  locale: Locale;
  onUpload: (file: File) => void;
  onRemove: () => void;
}

export function LogoField({ src, alt, disabled, locale, onUpload, onRemove }: Props) {
  const t = brandingMessages(locale);
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <span className="font-medium">{t.logoLabel}</span>
      {src ? (
        <img src={src} alt={alt} className="h-16 w-auto max-w-[60%] self-start rounded border object-contain p-1" />
      ) : (
        <p className="text-muted-foreground text-sm">{t.logoNone}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={id}
          className="hover:bg-accent inline-flex h-10 cursor-pointer items-center rounded-md border px-4 text-sm font-medium has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
        >
          {src ? t.logoReplace : t.logoUpload}
          <input
            id={id}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={disabled}
            data-logo-input
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) {
                onUpload(file);
              }
            }}
          />
        </label>
        {src && (
          <button
            type="button"
            disabled={disabled}
            className="text-destructive hover:bg-accent h-10 rounded-md border px-4 text-sm font-medium disabled:opacity-50"
            onClick={() => {
              if (window.confirm(t.logoRemoveConfirm)) {
                onRemove();
              }
            }}
          >
            {t.logoRemove}
          </button>
        )}
      </div>
      <p className="text-muted-foreground text-sm">{t.logoHint}</p>
    </div>
  );
}
