import { useCallback, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { GuestImportPreviewDto } from "@/types";
import { networkFailure, readJson, toFailure, type ApiFailure } from "./api-failure";

// The import's preview (guest-import-diets, S-23): POST <apiBase>/guests/import { text, preview: true } reads the text
// on the server with the same rules as the save and answers what would be added and what must be fixed; nothing is
// stored. The save itself goes through useGuestList.send (its answer is the guest list). An answer to an older text is
// ignored, so a quick edit never shows a stale preview.

function isPreview(data: unknown): data is GuestImportPreviewDto {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const candidate = data as Partial<Record<keyof GuestImportPreviewDto, unknown>>;
  return Array.isArray(candidate.rows) && Array.isArray(candidate.problems) && typeof candidate.ready === "boolean";
}

export function useGuestImport(apiBase: string, locale: Locale) {
  const [preview, setPreview] = useState<GuestImportPreviewDto | null>(null);
  const [checking, setChecking] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const request = useRef(0);

  const check = useCallback(
    async (text: string) => {
      const id = ++request.current;
      setChecking(true);
      setFailure(null);
      try {
        const response = await fetch(`${apiBase}/guests/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, preview: true }),
        });
        const data = await readJson(response);
        if (id !== request.current) {
          return;
        }
        if (response.ok && isPreview(data)) {
          setPreview(data);
        } else {
          setPreview(null);
          setFailure(toFailure(data, locale));
        }
      } catch {
        if (id === request.current) {
          setPreview(null);
          setFailure(networkFailure(locale));
        }
      } finally {
        if (id === request.current) {
          setChecking(false);
        }
      }
    },
    [apiBase, locale],
  );

  // Any edit of the text drops the preview (and an answer still on its way).
  const clear = useCallback(() => {
    request.current += 1;
    setPreview(null);
    setFailure(null);
    setChecking(false);
  }, []);

  const fail = useCallback((message: string) => {
    request.current += 1;
    setPreview(null);
    setChecking(false);
    setFailure({ message, details: [] });
  }, []);

  return { preview, checking, failure, check, clear, fail };
}
