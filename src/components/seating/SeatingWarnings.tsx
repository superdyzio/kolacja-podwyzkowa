// Non-blocking warnings (split groups, absent guests with a seat, missing seats) — publishing is still allowed.
export function SeatingWarnings({ lines }: { lines: string[] }) {
  return (
    <div aria-live="polite">
      {lines.length > 0 && (
        <section
          aria-labelledby="warnings-heading"
          className="flex flex-col gap-2 rounded-lg border border-amber-500/60 bg-amber-500/5 p-3"
        >
          <h2 id="warnings-heading" className="font-medium">
            Uwagi
          </h2>
          <ul className="list-disc pl-5 text-sm">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">Uwagi nie blokują publikacji.</p>
        </section>
      )}
    </div>
  );
}
