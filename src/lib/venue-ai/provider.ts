import { describeFailureForOrganizer, type AiFailureKind, type AiGeneration } from "@/lib/ai-topics/provider";
import type { AiProviderKind, TableShape } from "@/types";

// The contract of a venue-layout provider (venue-drawing): one call that reads the plan image and returns the raw
// JSON text of a proposal (schema.ts), plus the tokens it was billed for. The mock (default) and Claude over the
// Anthropic Messages API. Failures are AiProviderError with the AI-topic kinds (src/lib/ai-topics/provider.ts).

// Sonnet reads floor plans far better than Haiku; one call per redraw, a few cents.
export const VENUE_VISION_MODEL = "claude-sonnet-5-5";
// The provider gives up after this; the Lambda allows 30 s per request, the browser waits 32 s.
export const VENUE_VISION_TIMEOUT_MS = 25_000;
export const VENUE_VISION_CLIENT_TIMEOUT_MS = 32_000;
// The browser sends a downscaled JPEG (long edge ≤ 1568 px, the size Claude reads without resizing).
export const MAX_LAYOUT_IMAGE_BYTES = 1_572_864;
export const LAYOUT_IMAGE_MAX_EDGE = 1568;

// What the provider may know about the venue: names, shapes, seat counts and positions. Never any guest data.
export interface VenuePromptInput {
  rooms: { name: string }[];
  tables: { name: string; shape: TableShape; seatCount: number; x: number; y: number; rotation: number }[];
}

export interface LayoutImage {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
}

export interface VenueVisionProvider {
  readonly kind: AiProviderKind;
  readonly model: string | null;
  readonly ready: boolean;
  readLayout(
    input: { image: LayoutImage; venue: VenuePromptInput },
    options: { signal: AbortSignal },
  ): Promise<AiGeneration>;
}

export const LAYOUT_FAILED_MESSAGE = "Nie udało się odczytać układu ze zdjęcia.";
export const LAYOUT_BAD_OUTPUT_HINT = "AI zwróciło układ w nieczytelnej formie — spróbuj ponownie.";
export const LAYOUT_IMAGE_TOO_LARGE_MESSAGE = "Zdjęcie jest za duże — najwyżej 1,5 MB.";

// The organizer's hint for a failed read; the timeout names this call's own limit.
export function describeLayoutFailure(kind: AiFailureKind, status?: number): string {
  if (kind === "timeout") {
    return `Przekroczono czas ${String(VENUE_VISION_TIMEOUT_MS / 1000)} s — spróbuj ponownie.`;
  }
  return describeFailureForOrganizer(kind, status);
}
