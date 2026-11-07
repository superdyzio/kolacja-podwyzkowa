import { useState } from "react";
import { networkFailure, readJson, toFailure } from "@/components/hooks/api-failure";
import { isGuestState } from "@/components/hooks/guest-state-store";
import { useGuestState } from "@/components/hooks/useGuestState";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { guestOrderMessages } from "@/lib/orders/messages";
import { cn } from "@/lib/utils";
import type { GuestOrderLineDto, GuestOrderPieceDto, GuestStateDto } from "@/types";

interface Props {
  // Guest API base, e.g. "/api/g/<key>".
  apiBase: string;
  initial: GuestStateDto;
  locale: Locale;
}

function pieceKey(line: GuestOrderLineDto, piece: GuestOrderPieceDto): string {
  return `${String(line.lineId)}:${String(piece.piece)}`;
}

// „Twoje zamówienie” on the guest's phone (guest-delivered): the guest's own dishes and the dishes for the middle of
// their table, every piece with its own „Dotarło” button. A mark shows who made it (you, another guest, the
// organizer); a guest's mark can be undone, the organizer's only by the organizer. No prices. Reads the page's shared
// live state (one poll per phone), so a tablemate's or the organizer's mark shows up within one poll; the whole
// section is absent while the guest has no lines.
export function GuestOrderView({ apiBase, initial, locale }: Props) {
  const t = guestOrderMessages(locale);
  const { state, push, refresh } = useGuestState(apiBase, initial);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);

  // A state from a server without orders (only during a deploy) shows no section rather than breaking the page.
  const orders = state && Array.isArray(state.orders) ? state.orders : [];
  if (!state || orders.length === 0) {
    return null;
  }
  const own = orders.filter((line) => line.kind === "own");
  const table = orders.filter((line) => line.kind === "table");

  async function mark(line: GuestOrderLineDto, piece: GuestOrderPieceDto, delivered: boolean) {
    const key = pieceKey(line, piece);
    setPending((current) => new Set(current).add(key));
    setProblem(null);
    try {
      const response = await fetch(`${apiBase}/orders`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineId: line.lineId, piece: piece.piece, delivered }),
      });
      const data = await readJson(response);
      if (response.ok && isGuestState(data)) {
        push(data);
        return;
      }
      setProblem(toFailure(data, locale).message);
      // The line moved, shrank or was marked by the organizer meanwhile (409), or access is gone (404).
      refresh();
    } catch {
      setProblem(networkFailure(locale).message);
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  function byText(piece: GuestOrderPieceDto): string {
    switch (piece.deliveredBy) {
      case "you":
        return t.byYou;
      case "guest":
        return t.byGuest;
      default:
        return t.byOrganizer;
    }
  }

  function renderPiece(line: GuestOrderLineDto, piece: GuestOrderPieceDto) {
    const busy = pending.has(pieceKey(line, piece));
    const many = line.quantity > 1;
    if (piece.deliveredBy === null) {
      return (
        <li key={piece.piece}>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full justify-start"
            disabled={busy}
            aria-label={t.markLabel(line.name, piece.piece, line.quantity)}
            onClick={() => void mark(line, piece, true)}
          >
            {many ? `${t.piece(piece.piece, line.quantity)}: ${t.deliver}` : t.deliver}
          </Button>
        </li>
      );
    }
    return (
      <li
        key={piece.piece}
        className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md bg-emerald-600/10 px-3 py-1.5"
      >
        <span className="flex flex-col">
          <span className="font-medium text-emerald-800 dark:text-emerald-300">
            {many ? `${t.piece(piece.piece, line.quantity)}: ${t.delivered}` : t.delivered}
          </span>
          <span className="text-muted-foreground text-xs">{byText(piece)}</span>
        </span>
        {piece.deliveredBy === "organizer" ? (
          <span className="text-muted-foreground text-xs">{t.organizerOnly}</span>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="h-10"
            disabled={busy}
            aria-label={t.undoLabel(line.name, piece.piece, line.quantity)}
            onClick={() => void mark(line, piece, false)}
          >
            {t.undo}
          </Button>
        )}
      </li>
    );
  }

  function renderLines(lines: readonly GuestOrderLineDto[]) {
    return (
      <ul className="flex flex-col gap-3">
        {lines.map((line) => {
          const done = line.pieces.every((piece) => piece.deliveredBy !== null);
          return (
            <li key={line.lineId} className={cn("flex flex-col gap-2 rounded-lg border p-3", done && "bg-muted/50")}>
              <div className="flex flex-col">
                <span className="font-medium break-words">
                  {line.name}
                  {line.quantity > 1 && ` × ${String(line.quantity)}`}
                </span>
                {line.note && <span className="text-muted-foreground text-sm break-words">{line.note}</span>}
              </div>
              <ul className="flex flex-col gap-2">{line.pieces.map((piece) => renderPiece(line, piece))}</ul>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section aria-labelledby="order-heading" className="flex flex-col gap-3">
      <h2 id="order-heading" className="text-xl font-semibold">
        {t.heading}
      </h2>
      <p className="text-muted-foreground text-sm">{t.intro}</p>
      {problem && (
        <p role="alert" className="text-destructive text-sm">
          {problem}
        </p>
      )}
      {own.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t.ownHeading}</h3>
          {renderLines(own)}
        </div>
      )}
      {table.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t.tableHeading(state.seat?.table ?? null)}</h3>
          {renderLines(table)}
        </div>
      )}
    </section>
  );
}
