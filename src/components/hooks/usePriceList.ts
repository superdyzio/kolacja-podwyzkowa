import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { parseUnitPrice } from "@/lib/orders/rules";
import type { PriceKind, PriceListRowDto } from "@/types";
import { networkFailure, readJson, toFailure, type ApiFailure } from "./api-failure";

// „Cennik wydarzenia” in the panel (client-restaurant-split, FR-027): the rows (GET <apiBase>/prices, read again when
// the page becomes visible, so lines the client added meanwhile show up) and setting one name's price
// (PUT <apiBase>/prices { kind, name, price } → the fresh rows). apiBase = /api/panel/events/<id>.

function isRows(data: unknown): data is { rows: PriceListRowDto[] } {
  return (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as { rows?: unknown }).rows) &&
    (data as { rows: unknown[] }).rows.every(
      (row) =>
        typeof row === "object" &&
        row !== null &&
        typeof (row as PriceListRowDto).name === "string" &&
        Number.isInteger((row as PriceListRowDto).priceGrosze),
    )
  );
}

export function priceRowKey(row: Pick<PriceListRowDto, "kind" | "name">): string {
  return `${row.kind}:${row.name.toLowerCase()}`;
}

export function usePriceList(apiBase: string, initial: PriceListRowDto[], locale: Locale) {
  const [rows, setRows] = useState(initial);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ key: string; problem: ApiFailure } | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  // A read started before a save must not bring the old price back.
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const started = generation.current;
    try {
      const response = await fetch(`${apiBase}/prices`);
      const data = await readJson(response);
      if (response.ok && isRows(data) && started === generation.current) {
        setRows(data.rows);
      }
    } catch {
      // Keep what is shown; the next visit reads again.
    }
  }, [apiBase]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const save = useCallback(
    async (kind: PriceKind, name: string, text: string): Promise<boolean> => {
      const key = priceRowKey({ kind, name });
      const parsed = parseUnitPrice(text, locale);
      setSavedKey(null);
      if (!parsed.ok) {
        setFailure({ key, problem: { message: parsed.message, details: [] } });
        return false;
      }
      generation.current += 1;
      setPendingKey(key);
      setFailure(null);
      try {
        const response = await fetch(`${apiBase}/prices`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, name, price: text }),
        });
        const data = await readJson(response);
        if (response.ok && isRows(data)) {
          setRows(data.rows);
          setSavedKey(key);
          return true;
        }
        setFailure({ key, problem: toFailure(data, locale) });
        if (response.status === 404) {
          void refresh();
        }
      } catch {
        setFailure({ key, problem: networkFailure(locale) });
      } finally {
        setPendingKey(null);
      }
      return false;
    },
    [apiBase, locale, refresh],
  );

  return { rows, pendingKey, failure, savedKey, save };
}
