import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { seatingEditorMessages } from "@/lib/seating/messages";
import { formatPublishedAt, formatSeatedCount, type SeatingSummary } from "@/lib/seating/rules";
import type { PublicationDto } from "@/types";

interface Props {
  published: PublicationDto | null;
  upToDate: boolean;
  summary: SeatingSummary;
  pending: boolean;
  onPublish: () => void;
  locale: Locale;
}

function statusLine(published: PublicationDto | null, upToDate: boolean, locale: Locale): string {
  const t = seatingEditorMessages(locale);
  if (published === null) {
    return t.nothingPublished;
  }
  return upToDate ? t.tvUpToDate(formatPublishedAt(published.publishedAt, locale)) : t.unpublishedChanges;
}

// Publication status and the „Opublikuj na TV” button (disabled while the TV already shows this arrangement).
export function PublishBar({ published, upToDate, summary, pending, onPublish, locale }: Props) {
  const t = seatingEditorMessages(locale);
  return (
    <section
      aria-labelledby="publish-heading"
      className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id="publish-heading" className="font-semibold" aria-live="polite">
          {statusLine(published, upToDate, locale)}
        </h2>
        <p className="text-sm">
          {formatSeatedCount(summary, locale)}
          {summary.pinned > 0 && t.pinnedCount(summary.pinned)}
        </p>
        <p className="text-muted-foreground text-xs">
          {published !== null && !upToDate && t.tvShowsFrom(formatPublishedAt(published.publishedAt, locale))}
          {t.tvOnlyPublished}
        </p>
      </div>
      <Button type="button" className="h-10 shrink-0" disabled={pending || upToDate} onClick={onPublish}>
        {t.publish}
      </Button>
    </section>
  );
}
