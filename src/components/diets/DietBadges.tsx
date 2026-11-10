import { dietMessages } from "@/lib/diets/messages";
import { isAllergyTag, type DietTag } from "@/lib/diets/rules";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  diets: readonly DietTag[];
  note: string | null;
  locale: Locale;
  className?: string;
}

// A guest's diet as small badges (guest-import-diets, S-23): allergies red with „!” (never colour alone), diets amber,
// the note as plain text after them. Nothing when the guest has neither. Staff and client screens only — never a
// guest's phone or the TV.
export function DietBadges({ diets, note, locale, className }: Props) {
  if (diets.length === 0 && note === null) {
    return null;
  }
  const t = dietMessages(locale);
  return (
    <span data-diet-badges="" className={cn("inline-flex flex-wrap items-baseline gap-1 text-xs", className)}>
      {diets.map((tag) =>
        isAllergyTag(tag) ? (
          <span
            key={tag}
            data-diet={tag}
            className="rounded-full bg-red-600/10 px-2 py-0.5 font-semibold text-red-700 dark:text-red-400"
          >
            ! {t.labels[tag]}
          </span>
        ) : (
          <span
            key={tag}
            data-diet={tag}
            className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-900 dark:text-amber-300"
          >
            {t.labels[tag]}
          </span>
        ),
      )}
      {note !== null && (
        <span data-diet-note="" className="text-muted-foreground italic">
          {diets.length > 0 ? `· ${note}` : `${t.noteBadge}: ${note}`}
        </span>
      )}
    </span>
  );
}
