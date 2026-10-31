import { useId, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { QUESTION_CATEGORIES } from "@/lib/questions/categories";
import { describePasteResult, describeSkip, MAX_PASTE_CHARS } from "@/lib/questions/text";
import type { QuestionCategory, QuestionPasteResultDto } from "@/types";
import { CategorySelect } from "./CategorySelect";

interface Props {
  pending: boolean;
  // Adds the pasted questions to the category; resolves to the result, or null when the request failed.
  onAdd: (category: QuestionCategory, text: string) => Promise<QuestionPasteResultDto | null>;
}

interface Outcome {
  summary: string;
  skipped: string[];
}

// Adding questions (S-07, FR-014): one or many, one per line, into the chosen category. What is valid and new is
// added; the summary lists the skipped lines. Lines skipped for their length stay in the field to be fixed.
export function QuestionAddForm({ pending, onAdd }: Props) {
  const categoryId = useId();
  const textId = useId();
  const [category, setCategory] = useState<QuestionCategory>(QUESTION_CATEGORIES[0]);
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setOutcome(null);
    const result = await onAdd(category, text);
    if (!result) {
      return;
    }
    setOutcome({
      summary: describePasteResult(result.added, result.skipped.length),
      skipped: result.skipped.map(describeSkip),
    });
    setText(
      result.skipped
        .filter((skip) => skip.reason === "too-short" || skip.reason === "too-long")
        .map((skip) => skip.text)
        .join("\n"),
    );
  }

  return (
    <section aria-labelledby="add-questions-heading" className="flex flex-col gap-4 rounded-xl border p-4">
      <h2 id="add-questions-heading" className="text-lg font-semibold">
        Dodaj pytania
      </h2>
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <label htmlFor={categoryId} className="text-sm font-medium">
            Kategoria
          </label>
          <CategorySelect id={categoryId} value={category} onChange={setCategory} className="self-start" />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={textId} className="text-sm font-medium">
            Pytania — jedno pytanie w linii
          </label>
          <Textarea
            id={textId}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
            }}
            maxLength={MAX_PASTE_CHARS}
            rows={5}
            placeholder={"Co Cię ostatnio najbardziej zaskoczyło?\nGdzie chcesz być za pięć lat?"}
            className="max-h-[50vh] text-base"
          />
          <p className="text-muted-foreground text-sm">
            Możesz wkleić wiele pytań naraz. Puste linie, powtórki i pytania, które już są w bazie, zostaną pominięte.
          </p>
        </div>
        <Button type="submit" disabled={pending || text.trim() === ""} className="h-11 self-start text-base">
          Dodaj
        </Button>
      </form>
      {outcome && (
        <div role="status" className="flex flex-col gap-1">
          <p className="font-medium">{outcome.summary}</p>
          {outcome.skipped.length > 0 && (
            <ul className="text-muted-foreground list-disc pl-5 text-sm">
              {outcome.skipped.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
