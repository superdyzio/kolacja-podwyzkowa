import type { GuessBoardDto, PublishedSeatingDto } from "@/types";
import { isGuessBoardData, isPublishedSeating } from "./cache";

// One read of what the organizer's offline memory keeps (S-09): the latest published seating and the whole guess
// board, both from the organizer API, with an injected fetch so it runs in tests. It is also the connectivity check:
// no answer, a slow one (the caller aborts), a server error or a body that is not ours → "offline"; the app's own
// denial (404 with the private headers the middleware adds) → "gone" (the organizer link no longer opens anything).

export type OfflineReadResult =
  | { status: "ok"; published: PublishedSeatingDto | null; board: GuessBoardDto }
  | { status: "offline" }
  | { status: "gone" };

export type FetchFunction = (input: string, init?: RequestInit) => Promise<Response>;

const OFFLINE: OfflineReadResult = { status: "offline" };

// A 404 counts as the app's denial only with the header the key guard adds to every guarded answer, so a captive
// portal or a proxy answering 404 never wipes the saved state.
function isDenial(response: Response): boolean {
  return response.status === 404 && (response.headers.get("x-robots-tag") ?? "").includes("noindex");
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

function publishedOf(body: unknown): PublishedSeatingDto | null | undefined {
  if (typeof body !== "object" || body === null || !("published" in body)) {
    return undefined;
  }
  const { published } = body;
  return published === null || isPublishedSeating(published) ? published : undefined;
}

export async function readOfflineState(
  apiBase: string,
  fetchFn: FetchFunction,
  signal: AbortSignal,
): Promise<OfflineReadResult> {
  let responses: [Response, Response];
  try {
    responses = await Promise.all([
      fetchFn(`${apiBase}/seating/published`, { signal, cache: "no-store" }),
      fetchFn(`${apiBase}/guesses`, { signal, cache: "no-store" }),
    ]);
  } catch {
    return OFFLINE;
  }
  const [seatingResponse, guessesResponse] = responses;
  if (isDenial(seatingResponse) || isDenial(guessesResponse)) {
    return { status: "gone" };
  }
  if (!seatingResponse.ok || !guessesResponse.ok) {
    return OFFLINE;
  }
  const [seatingBody, board] = await Promise.all([readBody(seatingResponse), readBody(guessesResponse)]);
  const published = publishedOf(seatingBody);
  if (published === undefined || !isGuessBoardData(board) || signal.aborted) {
    return OFFLINE;
  }
  return { status: "ok", published, board };
}
