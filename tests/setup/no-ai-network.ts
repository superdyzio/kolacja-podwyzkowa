// Vitest setup (S-08): the test suite must never make a paid AI call, even when a real key sits in .env. Any request
// to the Anthropic API host rejects here; everything else (the local Supabase) passes through. The Anthropic adapter is
// tested with injected fetch stubs only.

export const BLOCKED_AI_HOST = "api.anthropic.com";
export const BLOCKED_AI_MESSAGE =
  "no-ai-network: testy nie mogą wywoływać API Anthropic (tests/setup/no-ai-network.ts)";

function hostOf(input: RequestInfo | URL): string | null {
  try {
    if (input instanceof URL) {
      return input.hostname;
    }
    if (typeof input === "string") {
      return new URL(input).hostname;
    }
    return new URL(input.url).hostname;
  } catch {
    return null;
  }
}

const realFetch = globalThis.fetch;

globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  if (hostOf(input)?.toLowerCase() === BLOCKED_AI_HOST) {
    return Promise.reject(new Error(BLOCKED_AI_MESSAGE));
  }
  return realFetch(input, init);
};
