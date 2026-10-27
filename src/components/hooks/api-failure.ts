// Turning organizer API answers into Polish messages for the islands. Error bodies are
// `{ "error": "<message>", "problems"?: string[] }` (src/lib/http.ts).

export interface ApiFailure {
  message: string;
  // Extra lines to show (e.g. the paste problems, one per line).
  details: string[];
}

export const NETWORK_FAILURE: ApiFailure = {
  message: "Brak połączenia z serwerem. Sprawdź sieć i spróbuj ponownie.",
  details: [],
};

export function toFailure(data: unknown): ApiFailure {
  if (typeof data === "object" && data !== null) {
    const { error, problems } = data as { error?: unknown; problems?: unknown };
    if (typeof error === "string") {
      const details = Array.isArray(problems)
        ? problems.filter((line): line is string => typeof line === "string")
        : [];
      return { message: error, details };
    }
  }
  return { message: "Coś poszło nie tak. Spróbuj ponownie.", details: [] };
}

export async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}
