import { useState } from "react";
import { Button } from "@/components/ui/button";
import { describeAdded } from "@/lib/questions/text";

interface Props {
  // Starter questions that are not in the base (QuestionListDto.starterMissing).
  starterMissing: number;
  pending: boolean;
  // Loads the missing starter questions; resolves to how many were added, or null when the request failed.
  onLoad: () => Promise<number | null>;
}

function missingText(count: number): string {
  return `Brakuje ${count} ${count === 1 ? "pytania" : "pytań"} z bazy startowej.`;
}

// The starter base (S-07): ~30 ready questions per category. A new event gets them at creation; deleted or moved
// starter questions come back only from here.
export function StarterCard({ starterMissing, pending, onLoad }: Props) {
  const [result, setResult] = useState<string | null>(null);

  async function load() {
    setResult(null);
    const added = await onLoad();
    if (added !== null) {
      setResult(describeAdded(added));
    }
  }

  return (
    <section aria-labelledby="starter-heading" className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 id="starter-heading" className="text-lg font-semibold">
        Baza startowa
      </h2>
      <p className="text-muted-foreground text-sm">
        Gotowe pytania w trzech kategoriach. Wczytanie dodaje tylko te, których brakuje w bazie — niczego nie usuwa ani
        nie zmienia.
      </p>
      <p className="font-medium">
        {starterMissing === 0 ? "Baza startowa jest kompletna." : missingText(starterMissing)}
      </p>
      <Button
        type="button"
        variant="outline"
        className="h-11 self-start text-base"
        disabled={pending || starterMissing === 0}
        onClick={() => void load()}
      >
        Wczytaj bazę startową
      </Button>
      {result && (
        <p role="status" className="font-medium text-emerald-700">
          {result}
        </p>
      )}
    </section>
  );
}
