import { defineMessages } from "@/lib/i18n/locale";
import { pluralEn, pluralPl } from "@/lib/i18n/plural";

// Texts of AI conversation topics (S-08, ai-spend), both languages (i18n). The numbers (limits, the timeout) are
// parameters, so this module imports nothing from limits.ts (which builds its messages from here). Pure: shared by the
// server, the organizer's page and the guest's phone. The topics themselves come from the AI in the requester's
// language (prompt.ts, mock-topics.ts).

function withStatus(text: string, status: number | undefined): string {
  return status === undefined ? text : `${text} (HTTP ${String(status)})`;
}

export const aiTopicMessages = defineMessages(
  {
    guestLimit: (max: number) =>
      `Wykorzystano już wszystkie tematy AI na ten wieczór (${max} z ${max}). Losuj pytania z bazy powyżej.`,
    eventLimit: (max: number) =>
      `Tematy AI na ten wieczór się skończyły (${max} z ${max}). Losuj pytania z bazy powyżej.`,
    busy: "Poprzedni temat jeszcze się generuje — chwilę.",
    failed:
      "Nie udało się wygenerować tematu — ta próba nie zmniejszyła limitu. Spróbuj ponownie albo użyj „Losuj pytanie” powyżej.",
    remaining: (remaining: number, limit: number) => `Zostało ${remaining} z ${limit}`,
    usage: (used: number, limit: number) => `Wykorzystano ${used} z ${limit}`,
    usageFailed: (failed: number) => `nieudane: ${failed}`,
    providerNoKey: "brak klucza API",
    providerInvalid: "błędna konfiguracja AI",
    providerMock: "atrapa AI",
    summary: (used: number, limit: number) => `Tematy AI: ${used} z ${limit}`,
    summaryLastFailed: "ostatnia próba nieudana",
    // The provider configuration (organizer only).
    missingKey: "Brak ANTHROPIC_API_KEY — dodaj klucz albo ustaw AI_PROVIDER=mock.",
    unknownProvider: (value: string) => `Nieznana wartość AI_PROVIDER: „${value}” — dozwolone: mock, anthropic.`,
    // Why an attempt failed (organizer only; guests see `failed`).
    hintTimeout: (seconds: number) => `Przekroczono czas ${String(seconds)} s.`,
    hintNetwork: "Brak połączenia z dostawcą AI.",
    hintAuth: (status?: number) => `${withStatus("Klucz API odrzucony", status)} — sprawdź ANTHROPIC_API_KEY.`,
    hintNoCredits: (status?: number) =>
      `${withStatus("Skończyły się kredyty API Anthropic albo zadziałał limit wydatków", status)} — doładuj je w konsoli: platform.claude.com → Billing.`,
    hintBadRequestBilling: (status?: number) =>
      `${withStatus("Model niedostępny, złe parametry albo blokada rozliczeń", status)} — sprawdź AI_MODEL i Billing na platform.claude.com.`,
    hintBadRequest: (status?: number) =>
      `${withStatus("Model niedostępny lub złe parametry", status)} — sprawdź AI_MODEL.`,
    hintRateLimit: (status?: number) => `${withStatus("Limit zapytań u dostawcy", status)}.`,
    hintOverloaded: (status?: number) => `${withStatus("Dostawca przeciążony", status)}.`,
    hintUnavailable: (status?: number) => `${withStatus("Dostawca AI niedostępny", status)}.`,
    hintRefusal: "AI odmówiło odpowiedzi.",
    hintTruncated: "Odpowiedź AI była za długa i została ucięta.",
    hintEmpty: "AI zwróciło pustą odpowiedź.",
    hintOffLimits: "Temat wykraczał poza granice treści — odrzucony.",
    hintNotRecorded: "Przyczyna nie została zapisana.",
    // The estimate (cost.ts).
    decimalSeparator: ",",
    groupSeparator: " ",
    tokens: (count: number) => pluralPl(count, "token", "tokeny", "tokenów"),
    noPricing: "brak cennika dla tego modelu",
  },
  {
    guestLimit: (max: number) =>
      `You have used all AI topics for this evening (${max} of ${max}). Draw questions from the base above.`,
    eventLimit: (max: number) =>
      `The AI topics for this evening have run out (${max} of ${max}). Draw questions from the base above.`,
    busy: "The previous topic is still being generated — one moment.",
    failed:
      "Could not generate a topic — this attempt did not count against the limit. Try again or use “Draw a question” above.",
    remaining: (remaining: number, limit: number) => `${remaining} of ${limit} left`,
    usage: (used: number, limit: number) => `Used ${used} of ${limit}`,
    usageFailed: (failed: number) => `failed: ${failed}`,
    providerNoKey: "no API key",
    providerInvalid: "AI misconfigured",
    providerMock: "mock AI",
    summary: (used: number, limit: number) => `AI topics: ${used} of ${limit}`,
    summaryLastFailed: "last attempt failed",
    missingKey: "ANTHROPIC_API_KEY is missing — add the key or set AI_PROVIDER=mock.",
    unknownProvider: (value: string) => `Unknown AI_PROVIDER value: “${value}” — allowed: mock, anthropic.`,
    hintTimeout: (seconds: number) => `Timed out after ${String(seconds)} s.`,
    hintNetwork: "No connection to the AI provider.",
    hintAuth: (status?: number) => `${withStatus("API key rejected", status)} — check ANTHROPIC_API_KEY.`,
    hintNoCredits: (status?: number) =>
      `${withStatus("The Anthropic API credits ran out or a spend limit kicked in", status)} — top up in the console: platform.claude.com → Billing.`,
    hintBadRequestBilling: (status?: number) =>
      `${withStatus("Model unavailable, wrong parameters or a billing block", status)} — check AI_MODEL and Billing on platform.claude.com.`,
    hintBadRequest: (status?: number) =>
      `${withStatus("Model unavailable or wrong parameters", status)} — check AI_MODEL.`,
    hintRateLimit: (status?: number) => `${withStatus("Provider rate limit reached", status)}.`,
    hintOverloaded: (status?: number) => `${withStatus("Provider overloaded", status)}.`,
    hintUnavailable: (status?: number) => `${withStatus("AI provider unavailable", status)}.`,
    hintRefusal: "The AI refused to answer.",
    hintTruncated: "The AI answer was too long and got cut off.",
    hintEmpty: "The AI returned an empty answer.",
    hintOffLimits: "The topic crossed the content bounds — rejected.",
    hintNotRecorded: "The cause was not recorded.",
    decimalSeparator: ".",
    groupSeparator: ",",
    tokens: (count: number) => pluralEn(count, "token", "tokens"),
    noPricing: "no price list for this model",
  },
);

// The AI topic panel (shared by the guest's phone and the organizer) and the organizer's AI section.
export const aiTopicUiMessages = defineMessages(
  {
    categoryLabel: "Kategoria tematu",
    allHint: "Kategorię wybierze AI.",
    generating: "Generuję…",
    generateNext: "Wygeneruj kolejny",
    generate: "Wygeneruj temat z AI",
    topicCaption: (category: string) => `${category} · temat od AI`,
    // OrganizerAiTopics
    notConfigured: "AI nie jest skonfigurowane.",
    providerMock: "Dostawca: atrapa AI — przykładowe tematy, bez połączenia z AI.",
    providerClaude: (model: string | null) => (model ? `Dostawca: Claude (${model}).` : "Dostawca: Claude."),
    cause: (hint: string) => `Przyczyna: ${hint}`,
    lastFailed: (hint: string) => `Ostatnia próba (np. gościa) się nie udała: ${hint}`,
    cost: (spend: string) => `Koszt AI od ostatniego resetu licznika: ${spend} — szacunek z cennika, nie saldo konta. `,
    balance: "Saldo i prawdziwe koszty:",
    console: "konsola Anthropic",
    consoleSuffix: "(Billing, Cost).",
    limits: (guestLimit: number, limit: number) =>
      `Goście: najwyżej ${String(guestLimit)} tematów na osobę, wszyscy razem ${String(limit)} na wieczór. Nieudane próby się nie liczą.`,
  },
  {
    categoryLabel: "Topic category",
    allHint: "The AI picks the category.",
    generating: "Generating…",
    generateNext: "Generate another",
    generate: "Generate an AI topic",
    topicCaption: (category: string) => `${category} · AI topic`,
    notConfigured: "AI is not configured.",
    providerMock: "Provider: mock AI — sample topics, no connection to an AI.",
    providerClaude: (model: string | null) => (model ? `Provider: Claude (${model}).` : "Provider: Claude."),
    cause: (hint: string) => `Cause: ${hint}`,
    lastFailed: (hint: string) => `The last attempt (e.g. a guest's) failed: ${hint}`,
    cost: (spend: string) =>
      `AI cost since the last counter reset: ${spend} — an estimate from the price list, not the account balance. `,
    balance: "Balance and real costs:",
    console: "Anthropic console",
    consoleSuffix: "(Billing, Cost).",
    limits: (guestLimit: number, limit: number) =>
      `Guests: at most ${String(guestLimit)} topics each, ${String(limit)} for everyone together this evening. Failed attempts do not count.`,
  },
);
