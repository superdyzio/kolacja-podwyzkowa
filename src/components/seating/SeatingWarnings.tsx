import type { Locale } from "@/lib/i18n";
import { seatingEditorMessages } from "@/lib/seating/messages";

// Non-blocking warnings (split groups, absent guests with a seat, missing seats) — publishing is still allowed.
export function SeatingWarnings({ lines, locale }: { lines: string[]; locale: Locale }) {
  const t = seatingEditorMessages(locale);
  return (
    <div aria-live="polite">
      {lines.length > 0 && (
        <section
          aria-labelledby="warnings-heading"
          className="flex flex-col gap-2 rounded-lg border border-amber-500/60 bg-amber-500/5 p-3"
        >
          <h2 id="warnings-heading" className="font-medium">
            {t.warningsHeading}
          </h2>
          <ul className="list-disc pl-5 text-sm">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">{t.warningsDoNotBlock}</p>
        </section>
      )}
    </div>
  );
}
