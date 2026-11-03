import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { networkFailure, readJson, toFailure } from "@/components/hooks/api-failure";
import type { Locale } from "@/lib/i18n";
import { orderMessages } from "@/lib/orders/messages";

interface Props {
  // Organizer API base, e.g. "/api/o/<key>".
  apiBase: string;
  // This request's origin: links are built from it (https behind the Lambda proxy).
  origin: string;
  // "/r/<key>".
  initialPath: string;
  locale: Locale;
}

// The restaurant's link on the organizer's order page (restaurant-orders): always on; „Kopiuj” and „Wymień link”
// (asks first; the old link stops working at once).
export function RestaurantLinkCard({ apiBase, origin, initialPath, locale }: Props) {
  const t = orderMessages(locale);
  const fieldId = useId();
  const field = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState(initialPath);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const url = new URL(path, origin).href;

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

  async function rotate() {
    if (!window.confirm(t.confirmRotate)) {
      return;
    }
    setPending(true);
    setStatus(null);
    try {
      const response = await fetch(`${apiBase}/restaurant-link`, { method: "POST" });
      const data = await readJson(response);
      const next = (data as { path?: unknown } | null)?.path;
      if (response.ok && typeof next === "string") {
        setPath(next);
        setStatus(t.rotated);
      } else {
        setStatus(toFailure(data, locale).message);
      }
    } catch {
      setStatus(networkFailure(locale).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby={`${fieldId}-heading`} className="flex flex-col gap-3 rounded-xl border p-4 sm:p-6">
      <h2 id={`${fieldId}-heading`} className="text-xl font-semibold">
        {t.linkHeading}
      </h2>
      <p className="text-muted-foreground text-sm">{t.linkIntro}</p>
      <label htmlFor={fieldId} className="sr-only">
        {t.linkHeading}
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
        className="bg-muted w-full rounded-md border px-3 py-2 font-mono text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-10" onClick={() => void copy()}>
          {t.copy}
        </Button>
        <Button variant="outline" className="h-10" asChild>
          <a href={url} target="_blank" rel="noreferrer">
            {t.openPreview}
          </a>
        </Button>
        <Button type="button" variant="ghost" className="h-10" disabled={pending} onClick={() => void rotate()}>
          {t.rotate}
        </Button>
      </div>
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
    </section>
  );
}
