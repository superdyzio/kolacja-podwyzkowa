import { MOCK_TOPICS } from "./mock-topics";
import { AiProviderError, type AiTopicProvider } from "./provider";

// The default AI provider (S-08): a random catalog topic after a short delay, no network, no cost. Used in dev, tests,
// the smoke and the overnight build. It honours the abort signal like a real call and can be told to fail.

export interface MockProviderOptions {
  // How long one "generation" takes; default 400–1200 ms.
  delayMs?: () => number;
  random?: () => number;
  // Every attempt fails (tests).
  fail?: boolean;
}

export const MOCK_FAILURE_HEADER = "x-ai-mock";
export const MOCK_FAILURE_VALUE = "fail";

function defaultDelay(): number {
  return 400 + Math.floor(Math.random() * 800);
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new AiProviderError("timeout"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AiProviderError("timeout"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function createMockProvider(options: MockProviderOptions = {}): AiTopicProvider {
  const delayMs = options.delayMs ?? defaultDelay;
  const random = options.random ?? Math.random;
  return {
    kind: "mock",
    model: null,
    ready: true,
    async generate(request, { signal, simulateFailure }) {
      await wait(delayMs(), signal);
      if (options.fail || simulateFailure) {
        throw new AiProviderError("unavailable", undefined, "AI: symulowana awaria atrapy");
      }
      const topics = MOCK_TOPICS[request.category];
      const index = Math.min(Math.floor(random() * topics.length), topics.length - 1);
      return topics[index] ?? "";
    },
  };
}

// The smoke's failure seam: header `x-ai-mock: fail` makes the mock fail. Never honoured by a real provider.
export function mockFailureRequested(provider: AiTopicProvider, headers: Headers): boolean {
  return provider.kind === "mock" && headers.get(MOCK_FAILURE_HEADER)?.trim().toLowerCase() === MOCK_FAILURE_VALUE;
}
