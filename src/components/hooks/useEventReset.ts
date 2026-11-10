import { useCallback, useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { ResetPart, ResetPreviewDto, ResetResultDto } from "@/types";
import { networkFailure, readJson, toFailure, type ApiFailure } from "./api-failure";
import { clearOfflineCache } from "./offline-cache-store";

// State of the reset modal: the fresh counts (GET <endpoint>) and the reset itself (POST <endpoint> { parts }) — the
// panel's full reset or the client's „Reset prób”. After a successful reset the offline memory of `apiBase` is
// forgotten, so the client's offline readout never shows data from before the reset (the shell's OfflineSync saves
// the new state again; a panel base owns no memory).

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPreview(data: unknown): data is ResetPreviewDto {
  return isRecord(data) && isRecord(data.counts) && typeof data.starterQuestions === "number";
}

function isResult(data: unknown): data is ResetResultDto {
  return (
    isRecord(data) &&
    Array.isArray(data.parts) &&
    isRecord(data.before) &&
    Array.isArray(data.summary) &&
    data.summary.every((line) => typeof line === "string")
  );
}

export function useEventReset(endpoint: string, apiBase: string, locale: Locale) {
  const [preview, setPreview] = useState<ResetPreviewDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [result, setResult] = useState<ResetResultDto | null>(null);

  const readPreview = useCallback(async (): Promise<ApiFailure | null> => {
    try {
      const response = await fetch(endpoint);
      const data = await readJson(response);
      if (response.ok && isPreview(data)) {
        setPreview(data);
        return null;
      }
      return toFailure(data, locale);
    } catch {
      return networkFailure(locale);
    }
  }, [endpoint, locale]);

  // Fresh counts each time the modal opens.
  const load = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    const problem = await readPreview();
    setFailure(problem);
    setLoading(false);
  }, [readPreview]);

  // Resolves to true when the reset happened.
  const reset = useCallback(
    async (parts: readonly ResetPart[]): Promise<boolean> => {
      setPending(true);
      setFailure(null);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parts }),
        });
        const data = await readJson(response);
        if (response.ok && isResult(data)) {
          clearOfflineCache(apiBase);
          setResult(data);
          return true;
        }
        setFailure(toFailure(data, locale));
      } catch {
        setFailure(networkFailure(locale));
      } finally {
        setPending(false);
      }
      // The answer may have been lost after the reset ran: show what is there now.
      await readPreview();
      return false;
    },
    [endpoint, apiBase, readPreview, locale],
  );

  const forget = useCallback(() => {
    setResult(null);
    setFailure(null);
  }, []);

  return { preview, loading, pending, failure, result, load, reset, forget };
}
