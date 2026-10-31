import { EVENT_ID } from "@/lib/event";
import { deniedIn } from "@/lib/questions/bounds";
import { secureRandom } from "@/lib/questions/draw";
import type { DbClient } from "@/lib/supabase-client";
import type { AiTopicDto, AiTopicUsageDto, GuestAiQuotaDto, QuestionCategory } from "@/types";
import { estimateSpend } from "./cost";
import { AI_PROVIDER_TIMEOUT_MS, MAX_EVENT_TOPICS, MAX_GUEST_TOPICS, toGuestQuota, toUsage } from "./limits";
import type { AiTopicUsageRow } from "./limits";
import { pickCategory, pickTheme } from "./prompt";
import {
  AiProviderError,
  describeFailureForOrganizer,
  isAiFailureKind,
  type AiFailureKind,
  type AiGeneration,
  type AiTokenUsage,
  type AiTopicProvider,
} from "./provider";
import { sanitizeTopic } from "./sanitize";

// One AI topic generation end to end (S-08, PRD FR-016, NFR-005): reserve an attempt atomically against the limits
// (reserve_ai_topic), call the provider under a 9 s abort, clean and check the text, then mark the attempt. Only a
// topic that was marked "succeeded" reaches the person; every failure marks the attempt "failed", so it never
// consumes the limit (if even that write fails, the pending attempt expires after 60 s). Each finished attempt also
// records the model, the tokens the provider billed (ai-spend) and, when it failed, why. Functions take the client
// as a parameter (no `astro:*`); Supabase errors throw, expected outcomes come back as status unions.

export interface GenerateTopicRequest {
  // null = the organizer (no personal limit).
  guestId: number | null;
  // null = „Wszystkie”: a random category.
  category: QuestionCategory | null;
}

export interface GenerateTopicOptions {
  random?: () => number;
  timeoutMs?: number;
  simulateFailure?: boolean;
  guestLimit?: number;
  eventLimit?: number;
}

export type GenerateTopicResult =
  | { status: "generated"; topic: AiTopicDto }
  | { status: "guest-limit" }
  | { status: "event-limit" }
  | { status: "busy" }
  | { status: "not-found" }
  | { status: "failed"; kind: AiFailureKind; httpStatus?: number };

function fail(action: string, message: string): never {
  throw new Error(`Nie udało się ${action}: ${message}`);
}

type Reservation =
  { status: "reserved"; id: number } | Exclude<GenerateTopicResult, { status: "generated" | "failed" }>;

async function reserve(
  db: DbClient,
  guestId: number | null,
  category: QuestionCategory,
  guestLimit: number,
  eventLimit: number,
): Promise<Reservation> {
  const { data, error } = await db.rpc("reserve_ai_topic", {
    p_event_id: EVENT_ID,
    p_guest_id: guestId,
    p_category: category,
    p_guest_limit: guestLimit,
    p_event_limit: eventLimit,
  });
  if (!error) {
    return { status: "reserved", id: data };
  }
  switch (error.message) {
    case "GUEST_LIMIT":
      return { status: "guest-limit" };
    case "EVENT_LIMIT":
      return { status: "event-limit" };
    case "GUEST_BUSY":
      return { status: "busy" };
    case "GUEST_NOT_FOUND":
    case "EVENT_NOT_FOUND":
      return { status: "not-found" };
    default:
      fail("zarezerwować tematu AI", error.message);
  }
}

interface AttemptOutcome {
  model: string | null;
  usage: AiTokenUsage | null;
  failure?: { kind: AiFailureKind; httpStatus?: number };
}

async function finish(
  db: DbClient,
  id: number,
  status: "succeeded" | "failed",
  outcome: AttemptOutcome,
): Promise<void> {
  const { error } = await db
    .from("ai_topic")
    .update({
      status,
      finished_at: new Date().toISOString(),
      model: outcome.model,
      input_tokens: outcome.usage?.inputTokens ?? null,
      output_tokens: outcome.usage?.outputTokens ?? null,
      failure_kind: outcome.failure?.kind ?? null,
      http_status: outcome.failure?.httpStatus ?? null,
    })
    .eq("id", id)
    .eq("status", "pending");
  if (error) {
    fail("zapisać próby tematu AI", error.message);
  }
}

// The provider call under our own deadline: aborts the request and rejects "timeout" even if the provider ignores
// the signal.
async function callWithDeadline(
  provider: AiTopicProvider,
  request: { category: QuestionCategory; theme: string },
  timeoutMs: number,
  simulateFailure: boolean,
): Promise<AiGeneration> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AiProviderError("timeout"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([provider.generate(request, { signal: controller.signal, simulateFailure }), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

function asFailure(error: unknown): { kind: AiFailureKind; httpStatus?: number } {
  if (error instanceof AiProviderError) {
    return error.status === undefined ? { kind: error.kind } : { kind: error.kind, httpStatus: error.status };
  }
  return { kind: "unavailable" };
}

export async function generateTopic(
  db: DbClient,
  provider: AiTopicProvider,
  request: GenerateTopicRequest,
  options: GenerateTopicOptions = {},
): Promise<GenerateTopicResult> {
  if (!provider.ready) {
    return { status: "failed", kind: "not-configured" };
  }
  const random = options.random ?? secureRandom;
  const category = request.category ?? pickCategory(random);
  const theme = pickTheme(random);

  const reservation = await reserve(
    db,
    request.guestId,
    category,
    options.guestLimit ?? MAX_GUEST_TOPICS,
    options.eventLimit ?? MAX_EVENT_TOPICS,
  );
  if (reservation.status !== "reserved") {
    return reservation;
  }

  let text: string;
  // Tokens of an answer that was billed even if it is unusable (empty or off-limits here, refusal or cut-off in the
  // provider).
  let usage: AiTokenUsage | null = null;
  try {
    const generation = await callWithDeadline(
      provider,
      { category, theme },
      options.timeoutMs ?? AI_PROVIDER_TIMEOUT_MS,
      options.simulateFailure ?? false,
    );
    usage = generation.usage;
    const clean = sanitizeTopic(generation.text);
    if (clean === null) {
      throw new AiProviderError("empty");
    }
    if (deniedIn(clean).length > 0) {
      throw new AiProviderError("off-limits");
    }
    text = clean;
  } catch (error) {
    const failure = asFailure(error);
    usage ??= error instanceof AiProviderError ? error.usage : null;
    // Best effort: an attempt left pending expires on its own and never counts.
    await finish(db, reservation.id, "failed", { model: provider.model, usage, failure }).catch(() => undefined);
    return { status: "failed", ...failure };
  }

  await finish(db, reservation.id, "succeeded", { model: provider.model, usage });
  return { status: "generated", topic: { category, text } };
}

async function readUsage(db: DbClient, guestId: number | null): Promise<AiTopicUsageRow> {
  const { data, error } = await db.rpc("ai_topic_usage", { p_event_id: EVENT_ID, p_guest_id: guestId });
  if (error) {
    fail("odczytać użycia tematów AI", error.message);
  }
  return data.at(0) ?? { event_used: 0, event_failed: 0, guest_used: 0, guest_busy: false };
}

async function readTokens(
  db: DbClient,
): Promise<{ model: string | null; inputTokens: number; outputTokens: number }[]> {
  const { data, error } = await db.rpc("ai_topic_tokens", { p_event_id: EVENT_ID });
  if (error) {
    fail("odczytać tokenów tematów AI", error.message);
  }
  return data.map((row) => ({ model: row.model, inputTokens: row.input_tokens, outputTokens: row.output_tokens }));
}

// Why the latest finished attempt failed, for the organizer; null when it succeeded or nothing finished yet. A failed
// attempt without a kind expired while pending (the server was cut off mid-call).
async function readLastFailureHint(db: DbClient): Promise<string | null> {
  const { data, error } = await db
    .from("ai_topic")
    .select("status, failure_kind, http_status")
    .eq("event_id", EVENT_ID)
    .neq("status", "pending")
    .order("finished_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(1);
  if (error) {
    fail("odczytać ostatniej próby tematu AI", error.message);
  }
  const last = data.at(0);
  if (last?.status !== "failed") {
    return null;
  }
  if (last.failure_kind === null) {
    return "Próba przerwana bez odpowiedzi — serwer nie zdążył zapisać wyniku.";
  }
  const kind = isAiFailureKind(last.failure_kind) ? last.failure_kind : "unavailable";
  return describeFailureForOrganizer(kind, last.http_status ?? undefined);
}

// The evening's usage for the organizer: the counts, the billed tokens with the estimate, and the latest failure.
export async function getAiTopicUsage(db: DbClient): Promise<AiTopicUsageDto> {
  const [row, tokens, lastFailureHint] = await Promise.all([
    readUsage(db, null),
    readTokens(db),
    readLastFailureHint(db),
  ]);
  return toUsage(row, { ...estimateSpend(tokens), lastFailureHint });
}

// One guest's own quota (their phone).
export async function getGuestAiQuota(db: DbClient, guestId: number): Promise<GuestAiQuotaDto> {
  return toGuestQuota(await readUsage(db, guestId));
}
