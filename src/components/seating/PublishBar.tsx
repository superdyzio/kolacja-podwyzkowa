import { Button } from "@/components/ui/button";
import { formatPublishedAt, formatSeatedCount, type SeatingSummary } from "@/lib/seating/rules";
import type { PublicationDto } from "@/types";

interface Props {
  published: PublicationDto | null;
  upToDate: boolean;
  summary: SeatingSummary;
  pending: boolean;
  onPublish: () => void;
}

function statusLine(published: PublicationDto | null, upToDate: boolean): string {
  if (published === null) {
    return "Jeszcze nic nie opublikowano";
  }
  return upToDate
    ? `TV jest aktualny — opublikowano ${formatPublishedAt(published.publishedAt)}`
    : "Są nieopublikowane zmiany";
}

// Publication status and the „Opublikuj na TV” button (disabled while the TV already shows this arrangement).
export function PublishBar({ published, upToDate, summary, pending, onPublish }: Props) {
  return (
    <section
      aria-labelledby="publish-heading"
      className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id="publish-heading" className="font-semibold" aria-live="polite">
          {statusLine(published, upToDate)}
        </h2>
        <p className="text-sm">
          {formatSeatedCount(summary)}
          {summary.pinned > 0 && ` · przypięte: ${summary.pinned}`}
        </p>
        <p className="text-muted-foreground text-xs">
          {published !== null && !upToDate && `TV pokazuje układ z ${formatPublishedAt(published.publishedAt)}. `}
          Na TV trafia tylko opublikowany układ, bez nieobecnych.
        </p>
      </div>
      <Button type="button" className="h-10 shrink-0" disabled={pending || upToDate} onClick={onPublish}>
        Opublikuj na TV
      </Button>
    </section>
  );
}
