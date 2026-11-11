import { useCallback, useState } from "react";
import type { Locale } from "@/lib/i18n/locale";
import { type ApiFailure, networkFailure, readJson, toFailure } from "./api-failure";

// One branding action at a time (event-branding, S-18): every successful answer replaces the brand shown by the
// island (`parse` checks its shape), a failure keeps the last brand and shows the server's message.
export function useBrandingApi<T>(initial: T, parse: (data: unknown) => T | null, locale: Locale) {
  const [branding, setBranding] = useState<T>(initial);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [saved, setSaved] = useState(false);

  const send = useCallback(
    async (url: string, init: RequestInit): Promise<boolean> => {
      setPending(true);
      setFailure(null);
      setSaved(false);
      try {
        const response = await fetch(url, init);
        const data = await readJson(response);
        const next = response.ok ? parse(data) : null;
        if (!next) {
          setFailure(toFailure(data, locale));
          return false;
        }
        setBranding(next);
        setSaved(true);
        return true;
      } catch {
        setFailure(networkFailure(locale));
        return false;
      } finally {
        setPending(false);
      }
    },
    [locale, parse],
  );

  return { branding, pending, failure, saved, send };
}
