import { useCallback, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { rsvpMessages } from "@/lib/rsvp/messages";
import type { RsvpOrdersSummaryDto } from "@/types";
import { networkFailure, readJson, toFailure, type ApiFailure } from "./api-failure";

// „Przenieś wybory do zamówień” on the client's RSVP page (the PR #4 review's RSVP extras), also in the panel's
// preview: first a fresh preview (GET <apiBase>/rsvp/orders), then — only when there is something to add and the
// person confirms in `window.confirm` — the move itself (POST). One action at a time; the outcome is one line of text
// (`notice`) or a failure. The answer's order board is not kept here: the order page reads its own.

export interface RsvpOrdersMoveNotice {
  text: string;
  // true once lines were added: the card links the order page.
  moved: boolean;
}

function isSummary(data: unknown): data is RsvpOrdersSummaryDto {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const candidate = data as Partial<Record<keyof RsvpOrdersSummaryDto, unknown>>;
  return (
    typeof candidate.added === "number" &&
    typeof candidate.skipped === "number" &&
    Array.isArray(candidate.notOnMenu) &&
    candidate.notOnMenu.every((name) => typeof name === "string")
  );
}

function summaryOf(data: unknown): RsvpOrdersSummaryDto | null {
  if (typeof data === "object" && data !== null && "summary" in data) {
    const { summary } = data;
    return isSummary(summary) ? summary : null;
  }
  return null;
}

export function useRsvpOrdersMove(apiBase: string, locale: Locale) {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<RsvpOrdersMoveNotice | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const move = useCallback(async () => {
    const t = rsvpMessages(locale);
    setPending(true);
    setNotice(null);
    setFailure(null);
    try {
      const previewResponse = await fetch(`${apiBase}/rsvp/orders`, { cache: "no-store" });
      const preview = await readJson(previewResponse);
      if (!previewResponse.ok || !isSummary(preview)) {
        setFailure(toFailure(preview, locale));
        return;
      }
      if (preview.notOnMenu.length > 0) {
        setFailure({ message: t.moveNotOnMenu(preview.notOnMenu.join(", ")), details: [] });
        return;
      }
      if (preview.added === 0) {
        setNotice({ text: t.moveNothing(preview.skipped), moved: false });
        return;
      }
      if (!window.confirm(t.confirmMove(preview.added, preview.skipped))) {
        return;
      }
      const response = await fetch(`${apiBase}/rsvp/orders`, { method: "POST" });
      const data = await readJson(response);
      const summary = response.ok ? summaryOf(data) : null;
      if (!summary) {
        setFailure(toFailure(data, locale));
        return;
      }
      setNotice(
        summary.added > 0
          ? { text: t.moved(summary.added, summary.skipped), moved: true }
          : { text: t.moveNothing(summary.skipped), moved: false },
      );
    } catch {
      setFailure(networkFailure(locale));
    } finally {
      setPending(false);
    }
  }, [apiBase, locale]);

  return { pending, notice, failure, move };
}
