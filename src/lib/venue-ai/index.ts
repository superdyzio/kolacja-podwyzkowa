// The venue layout read from the plan photo (venue-drawing). React islands import the pure modules (provider.ts for
// the limits and texts) directly, never this index (it also exports the DB service and the providers).
export { createAnthropicLayoutProvider, type AnthropicLayoutOptions } from "./anthropic-provider";
export { createVenueVisionProvider, type VenueVisionDeps } from "./config";
export { MATCH_RADIUS, matchLayout } from "./match";
export { createMockLayoutProvider, mockLayout, type MockLayoutOptions } from "./mock-provider";
export { VENUE_LAYOUT_SYSTEM_PROMPT, buildLayoutPrompt } from "./prompt";
export {
  LAYOUT_BAD_OUTPUT_HINT,
  LAYOUT_FAILED_MESSAGE,
  LAYOUT_IMAGE_MAX_EDGE,
  LAYOUT_IMAGE_TOO_LARGE_MESSAGE,
  MAX_LAYOUT_IMAGE_BYTES,
  VENUE_VISION_CLIENT_TIMEOUT_MS,
  VENUE_VISION_MODEL,
  VENUE_VISION_TIMEOUT_MS,
  describeLayoutFailure,
  type LayoutImage,
  type VenuePromptInput,
  type VenueVisionProvider,
} from "./provider";
export { LAYOUT_JSON_SCHEMA, parseLayoutText, type RawLayout, type RawLayoutRoom, type RawLayoutTable } from "./schema";
export { proposeVenueLayout, type ProposeLayoutResult } from "./service";
