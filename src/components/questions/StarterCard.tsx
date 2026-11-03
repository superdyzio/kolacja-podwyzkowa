import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { questionUiMessages } from "@/lib/questions/messages";
import { describeAdded } from "@/lib/questions/text";

interface Props {
  // Starter questions that are not in the base (QuestionListDto.starterMissing).
  starterMissing: number;
  pending: boolean;
  // Loads the missing starter questions; resolves to how many were added, or null when the request failed.
  onLoad: () => Promise<number | null>;
  locale: Locale;
}

// The starter base (S-07): ~30 ready questions per category. A new event gets them at creation; deleted or moved
// starter questions come back only from here.
export function StarterCard({ starterMissing, pending, onLoad, locale }: Props) {
  const t = questionUiMessages(locale);
  const [result, setResult] = useState<string | null>(null);

  async function load() {
    setResult(null);
    const added = await onLoad();
    if (added !== null) {
      setResult(describeAdded(added, locale));
    }
  }

  return (
    <section aria-labelledby="starter-heading" className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 id="starter-heading" className="text-lg font-semibold">
        {t.starterHeading}
      </h2>
      <p className="text-muted-foreground text-sm">{t.starterText}</p>
      <p className="font-medium">{starterMissing === 0 ? t.starterComplete : t.starterMissing(starterMissing)}</p>
      <Button
        type="button"
        variant="outline"
        className="h-11 self-start text-base"
        disabled={pending || starterMissing === 0}
        onClick={() => void load()}
      >
        {t.loadStarter}
      </Button>
      {result && (
        <p role="status" className="font-medium text-emerald-700">
          {result}
        </p>
      )}
    </section>
  );
}
