import { pluralPl } from "@/lib/guests/summary";

// Estimated cost of the evening's AI topics (ai-spend), pure. The provider reports the tokens of every answer it bills
// (ai_topic.input_tokens / output_tokens); this turns them into dollars at Anthropic's list prices. It is an estimate
// for the organizer, never the account balance: the balance and the real costs exist only in the Anthropic console
// (the API has no balance endpoint, and its usage and cost reports need an admin key, which individual accounts do not
// get).

// List prices in nano-dollars per token (= thousandths of a dollar per million tokens), standard tier, prompts up to
// 100K tokens (a topic prompt is a few hundred). As of 2026-10, from Anthropic's pricing; a model missing here gets no
// estimate (its tokens are still shown).
export const MODEL_PRICES: Readonly<Record<string, { input: number; output: number }>> = {
  "claude-haiku-5-5": { input: 100, output: 500 },
  "claude-haiku-4-5": { input: 1000, output: 5000 },
  "claude-sonnet-5-5": { input: 2000, output: 10_000 },
  "claude-sonnet-5": { input: 2000, output: 10_000 },
  "claude-sonnet-4-6": { input: 3000, output: 15_000 },
  "claude-opus-5-5": { input: 4000, output: 20_000 },
  "claude-opus-5": { input: 5000, output: 25_000 },
  "claude-fable-5-1": { input: 10_000, output: 50_000 },
};

const NANO_USD_PER_USD = 1_000_000_000;
const NBSP = " ";

// Billed tokens of one model (a row of ai_topic_tokens()); model null = attempts without a recorded model.
export interface ModelTokens {
  model: string | null;
  inputTokens: number;
  outputTokens: number;
}

export interface AiSpend {
  inputTokens: number;
  outputTokens: number;
  // Integer nano-dollars; null when tokens were billed by a model without a price here.
  costNanoUsd: number | null;
}

function priceOf(model: string | null): { input: number; output: number } | null {
  return model !== null && Object.hasOwn(MODEL_PRICES, model) ? (MODEL_PRICES[model] ?? null) : null;
}

export function estimateSpend(rows: readonly ModelTokens[]): AiSpend {
  let inputTokens = 0;
  let outputTokens = 0;
  let costNanoUsd: number | null = 0;
  for (const row of rows) {
    inputTokens += row.inputTokens;
    outputTokens += row.outputTokens;
    if (row.inputTokens === 0 && row.outputTokens === 0) {
      continue;
    }
    const price = priceOf(row.model);
    costNanoUsd =
      price === null || costNanoUsd === null
        ? null
        : costNanoUsd + row.inputTokens * price.input + row.outputTokens * price.output;
  }
  return { inputTokens, outputTokens, costNanoUsd };
}

// „0,0123 USD”: 4 decimals below a dollar (a topic costs hundredths of a cent), 2 from a dollar up; a non-zero amount
// that would round to nothing is „< 0,0001 USD”. Hand-rolled (no Intl), so the server and the browser agree.
export function formatUsd(nanoUsd: number): string {
  if (nanoUsd === 0) {
    return `0${NBSP}USD`;
  }
  if (nanoUsd < 50_000) {
    return `<${NBSP}0,0001${NBSP}USD`;
  }
  // Integer rounding (half up) instead of toFixed, which rounds the binary float (0.00165 → „0,0016”).
  // Anything that rounds to a whole dollar at 4 decimals (≥ 0,99995) already counts as a dollar: „1,00”, not „1,0000”.
  const decimals = nanoUsd < NANO_USD_PER_USD - 50_000 ? 4 : 2;
  const scale = 10 ** decimals;
  const units = Math.round((nanoUsd * scale) / NANO_USD_PER_USD);
  const fraction = String(units % scale).padStart(decimals, "0");
  return `${String(Math.floor(units / scale))},${fraction}${NBSP}USD`;
}

// „12 400 tokenów” (non-breaking spaces).
export function formatTokens(count: number): string {
  const digits = String(count).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${digits}${NBSP}${pluralPl(count, "token", "tokeny", "tokenów")}`;
}

// The organizer's cost line: „≈ 0,0123 USD (12 400 tokenów)”, or the tokens alone when the model has no price here.
export function formatSpend(spend: AiSpend): string {
  const tokens = formatTokens(spend.inputTokens + spend.outputTokens);
  return spend.costNanoUsd === null
    ? `${tokens} — brak cennika dla tego modelu`
    : `≈${NBSP}${formatUsd(spend.costNanoUsd)} (${tokens})`;
}
