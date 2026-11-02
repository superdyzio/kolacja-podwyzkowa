import { estimateSpend } from "@/lib/ai-topics/cost";
import { AiProviderError, type AiFailureKind, type AiTokenUsage } from "@/lib/ai-topics/provider";
import type { DbClient } from "@/lib/supabase-client";
import { bytesToBase64, sniffImageType } from "@/lib/venue/image";
import { getVenue } from "@/lib/venue/service";
import type { VenueLayoutProposalDto } from "@/types";
import { matchLayout } from "./match";
import { VENUE_VISION_TIMEOUT_MS, type VenuePromptInput, type VenueVisionProvider } from "./provider";
import { parseLayoutText } from "./schema";

// One layout read (venue-drawing): the plan image (as the browser sent it) and the venue's names and positions go to
// the provider; its answer is parsed, clamped and matched against the venue. Nothing is written: the organizer
// applies the lines they keep through applyVenueLayout. Nothing about guests is read or sent.

export type ProposeLayoutResult =
  | { status: "proposed"; proposal: VenueLayoutProposalDto; costNanoUsd: number | null }
  | { status: "unsupported-type" }
  | { status: "no-plan" }
  | { status: "failed"; kind: AiFailureKind; httpStatus?: number; costNanoUsd: number | null }
  | { status: "bad-output"; costNanoUsd: number | null };

function costOf(model: string | null, usage: AiTokenUsage | null): number | null {
  return usage === null ? 0 : estimateSpend([{ model, ...usage }]).costNanoUsd;
}

export async function proposeVenueLayout(
  db: DbClient,
  provider: VenueVisionProvider,
  bytes: Uint8Array,
): Promise<ProposeLayoutResult> {
  const mimeType = sniffImageType(bytes);
  if (mimeType === null) {
    return { status: "unsupported-type" };
  }
  const venue = await getVenue(db);
  // Positions are fractions of the plan image: without one there is nothing to draw on.
  if (venue.plan === null) {
    return { status: "no-plan" };
  }
  const input: VenuePromptInput = {
    rooms: venue.rooms.map((room) => ({ name: room.name })),
    tables: venue.tables.map((table) => ({
      name: table.name,
      shape: table.shape,
      seatCount: table.seatCount,
      x: table.x,
      y: table.y,
      rotation: table.rotation,
    })),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, VENUE_VISION_TIMEOUT_MS);
  try {
    const generation = await provider.readLayout(
      { image: { mimeType, base64: bytesToBase64(bytes) }, venue: input },
      { signal: controller.signal },
    );
    const costNanoUsd = costOf(provider.model, generation.usage);
    const raw = parseLayoutText(generation.text);
    if (raw === null) {
      return { status: "bad-output", costNanoUsd };
    }
    return { status: "proposed", proposal: matchLayout(raw, venue), costNanoUsd };
  } catch (error) {
    if (error instanceof AiProviderError) {
      return {
        status: "failed",
        kind: error.kind,
        httpStatus: error.status,
        costNanoUsd: costOf(provider.model, error.usage),
      };
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
