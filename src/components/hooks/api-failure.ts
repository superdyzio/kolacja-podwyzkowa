import { defineMessages, type Locale } from "@/lib/i18n/locale";

// Turning API answers into messages for the islands. Error bodies are `{ "error": "<message>", "problems"?: string[] }`
// (src/lib/http.ts), already in the request's language; only the two fallbacks below are written here (i18n).

export interface ApiFailure {
  message: string;
  // Extra lines to show (e.g. the paste problems, one per line).
  details: string[];
}

const failureMessages = defineMessages(
  {
    network: "Brak połączenia z serwerem. Sprawdź sieć i spróbuj ponownie.",
    unknown: "Coś poszło nie tak. Spróbuj ponownie.",
  },
  {
    network: "No connection to the server. Check the network and try again.",
    unknown: "Something went wrong. Please try again.",
  },
);

export function networkFailure(locale: Locale = "pl"): ApiFailure {
  return { message: failureMessages(locale).network, details: [] };
}

// The Polish network failure (kept for callers that have no locale yet).
export const NETWORK_FAILURE: ApiFailure = networkFailure("pl");

export function toFailure(data: unknown, locale: Locale = "pl"): ApiFailure {
  if (typeof data === "object" && data !== null) {
    const { error, problems } = data as { error?: unknown; problems?: unknown };
    if (typeof error === "string") {
      const details = Array.isArray(problems)
        ? problems.filter((line): line is string => typeof line === "string")
        : [];
      return { message: error, details };
    }
  }
  return { message: failureMessages(locale).unknown, details: [] };
}

export async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}
