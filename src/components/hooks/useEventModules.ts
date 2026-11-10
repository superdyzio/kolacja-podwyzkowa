import { useCallback, useState } from "react";
import type { Locale } from "@/lib/i18n/locale";
import { isModuleKey } from "@/lib/modules/rules";
import type { EventModulesDto } from "@/types";
import { networkFailure, readJson, toFailure, type ApiFailure } from "./api-failure";

// The modules card (event-modules, S-17): one action at a time, every answer replaces the whole list.

function parseModules(data: unknown): EventModulesDto | null {
  if (typeof data !== "object" || data === null || !Array.isArray((data as { modules?: unknown }).modules)) {
    return null;
  }
  const modules = (data as { modules: unknown[] }).modules;
  const ok = modules.every(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      isModuleKey((entry as { key?: unknown }).key) &&
      ["available", "enabled", "paid", "unlocked", "active"].every(
        (field) => typeof (entry as Record<string, unknown>)[field] === "boolean",
      ),
  );
  return ok ? (data as EventModulesDto) : null;
}

export function useEventModules(initial: EventModulesDto, locale: Locale) {
  const [state, setState] = useState(initial);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const send = useCallback(
    async (url: string, body: unknown) => {
      setPending(true);
      setFailure(null);
      try {
        const response = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await readJson(response);
        const fresh = response.ok ? parseModules(data) : null;
        if (fresh) {
          setState(fresh);
        } else {
          setFailure(toFailure(data, locale));
        }
      } catch {
        setFailure(networkFailure(locale));
      } finally {
        setPending(false);
      }
    },
    [locale],
  );

  return {
    state,
    pending,
    failure,
    send,
    dismissFailure: () => {
      setFailure(null);
    },
  };
}
