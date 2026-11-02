import { useCallback, useRef, useState } from "react";
import { LAYOUT_IMAGE_MAX_EDGE, MAX_LAYOUT_IMAGE_BYTES, VENUE_VISION_CLIENT_TIMEOUT_MS } from "@/lib/venue-ai/provider";
import type { VenueLayoutProposalAnswerDto } from "@/types";
import { NETWORK_FAILURE, readJson, toFailure } from "./api-failure";

// „Zaproponuj układ ze zdjęcia (AI)” (venue-drawing): the browser redraws the uploaded plan into a JPEG whose long
// edge is at most 1568 px (what Claude reads without resizing, and well under the Lambda's payload limit), posts it,
// and keeps the proposal until the organizer applies or drops it. Nothing is saved by the read itself.

export type LayoutProposalState =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "ready"; answer: VenueLayoutProposalAnswerDto }
  // costNanoUsd: what a failed read was billed (a refusal or a cut-off answer), null when nothing was.
  | { kind: "failed"; message: string; hint: string | null; costNanoUsd: number | null };

const TIMEOUT_MESSAGE = "AI nie odpowiedziało w ciągu pół minuty. Spróbuj ponownie.";
const IMAGE_MESSAGE = "Nie udało się przygotować zdjęcia planu. Odśwież stronę i spróbuj ponownie.";

function isAnswer(data: unknown): data is VenueLayoutProposalAnswerDto {
  if (typeof data !== "object" || data === null || !("proposal" in data)) {
    return false;
  }
  const proposal = data.proposal;
  return (
    typeof proposal === "object" &&
    proposal !== null &&
    ["updates", "newTables", "rooms"].every((field) => Array.isArray((proposal as Record<string, unknown>)[field]))
  );
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
}

// The plan image → a JPEG of at most LAYOUT_IMAGE_MAX_EDGE px on the long edge and under the upload limit.
async function planSnapshot(imageSrc: string): Promise<Blob | null> {
  const image = new Image();
  image.src = imageSrc;
  await image.decode();
  const scale = Math.min(1, LAYOUT_IMAGE_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  // A transparent PNG would turn black in a JPEG.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.85, 0.7, 0.5]) {
    const blob = await toBlob(canvas, quality);
    if (blob && blob.size <= MAX_LAYOUT_IMAGE_BYTES) {
      return blob;
    }
  }
  return null;
}

export function useLayoutProposal(apiBase: string) {
  const [state, setState] = useState<LayoutProposalState>({ kind: "idle" });
  // Dropping the proposal while a read runs ignores its answer.
  const generation = useRef(0);

  const request = useCallback(
    async (imageSrc: string) => {
      const current = ++generation.current;
      setState({ kind: "reading" });
      let blob: Blob | null;
      try {
        blob = await planSnapshot(imageSrc);
      } catch {
        blob = null;
      }
      if (!blob) {
        if (current === generation.current) {
          setState({ kind: "failed", message: IMAGE_MESSAGE, hint: null, costNanoUsd: null });
        }
        return;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, VENUE_VISION_CLIENT_TIMEOUT_MS);
      let next: LayoutProposalState;
      try {
        const response = await fetch(`${apiBase}/venue/layout-proposal`, {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: blob,
          signal: controller.signal,
        });
        const data = await readJson(response);
        if (response.ok && isAnswer(data)) {
          next = { kind: "ready", answer: data };
        } else {
          const { hint, costNanoUsd } = (data ?? {}) as { hint?: unknown; costNanoUsd?: unknown };
          next = {
            kind: "failed",
            message: toFailure(data).message,
            hint: typeof hint === "string" ? hint : null,
            costNanoUsd: typeof costNanoUsd === "number" && costNanoUsd > 0 ? costNanoUsd : null,
          };
        }
      } catch {
        next = {
          kind: "failed",
          message: controller.signal.aborted ? TIMEOUT_MESSAGE : NETWORK_FAILURE.message,
          hint: null,
          costNanoUsd: null,
        };
      } finally {
        clearTimeout(timer);
      }
      if (current === generation.current) {
        setState(next);
      }
    },
    [apiBase],
  );

  const discard = useCallback(() => {
    generation.current += 1;
    setState({ kind: "idle" });
  }, []);

  return { state, request, discard };
}
