import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { NETWORK_FAILURE, readJson, toFailure } from "@/components/hooks/api-failure";

interface Props {
  // Organizer API base, e.g. "/api/o/<key>".
  apiBase: string;
  // This request's origin: links are built from it (https behind the Lambda proxy).
  origin: string;
  // "/r/<key>".
  initialPath: string;
}

// The restaurant's link on the organizer's order page (restaurant-orders): always on; „Kopiuj” and „Wymień link”
// (asks first; the old link stops working at once).
export function RestaurantLinkCard({ apiBase, origin, initialPath }: Props) {
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
      setStatus("Skopiowano link.");
    } catch {
      field.current?.select();
      setStatus("Link jest zaznaczony — skopiuj go (Ctrl+C / Cmd+C).");
    }
  }

  async function rotate() {
    if (
      !window.confirm("Wymienić link restauracji? Stary link przestanie działać od razu — wyślij restauracji nowy.")
    ) {
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
        setStatus("Nowy link gotowy. Stary już nie działa.");
      } else {
        setStatus(toFailure(data).message);
      }
    } catch {
      setStatus(NETWORK_FAILURE.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby={`${fieldId}-heading`} className="flex flex-col gap-3 rounded-xl border p-4 sm:p-6">
      <h2 id={`${fieldId}-heading`} className="text-xl font-semibold">
        Link dla restauracji
      </h2>
      <p className="text-muted-foreground text-sm">
        Wyślij go restauracji: zobaczy listę dań do przygotowania i plan sali z tym, co gdzie podać — bez cen. Co
        odhaczysz jako wydane, u nich też jest oznaczone.
      </p>
      <label htmlFor={fieldId} className="sr-only">
        Link dla restauracji
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
          Kopiuj
        </Button>
        <Button variant="outline" className="h-10" asChild>
          <a href={url} target="_blank" rel="noreferrer">
            Otwórz podgląd
          </a>
        </Button>
        <Button type="button" variant="ghost" className="h-10" disabled={pending} onClick={() => void rotate()}>
          Wymień link
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
