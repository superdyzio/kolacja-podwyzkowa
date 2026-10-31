import { useId, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/guests/names";

interface Props {
  pending: boolean;
  // Adds the guests from the text (one per line); resolves to true when they were saved.
  onAdd: (text: string) => Promise<boolean>;
}

// Adding guests: one name at a time, or a pasted list (FR-001). A failed paste keeps the text so it can be fixed.
export function GuestAddForms({ pending, onAdd }: Props) {
  const singleId = useId();
  const pasteId = useId();
  const [name, setName] = useState("");
  const [pasted, setPasted] = useState("");
  const [showPaste, setShowPaste] = useState(false);

  async function submitSingle(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onAdd(name)) {
      setName("");
    }
  }

  async function submitPaste(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onAdd(pasted)) {
      setPasted("");
      setShowPaste(false);
    }
  }

  return (
    <section aria-labelledby="add-heading" className="flex flex-col gap-4 rounded-xl border p-4">
      <h2 id="add-heading" className="text-lg font-semibold">
        Dodaj gości
      </h2>

      <form onSubmit={submitSingle} className="flex flex-col gap-2">
        <label htmlFor={singleId} className="text-sm font-medium">
          Imię lub ksywka
        </label>
        <div className="flex gap-2">
          <Input
            id={singleId}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            autoComplete="off"
            enterKeyHint="done"
            placeholder="np. Kasia M."
            className="h-10"
          />
          <Button type="submit" disabled={pending || name.trim() === ""} className="h-10">
            Dodaj
          </Button>
        </div>
      </form>

      {showPaste ? (
        <form onSubmit={submitPaste} className="flex flex-col gap-2">
          <label htmlFor={pasteId} className="text-sm font-medium">
            Wklej listę — jedna osoba na linię
          </label>
          <Textarea
            id={pasteId}
            value={pasted}
            onChange={(event) => {
              setPasted(event.target.value);
            }}
            rows={8}
            placeholder={"Ania\nKuba\nKasia M."}
            className="max-h-[50vh]"
          />
          <p className="text-muted-foreground text-sm">
            Puste linie są pomijane. Jeśli coś się nie zgadza (powtórzone imię, za długa linia), nic nie zostanie
            dodane, a lista zostanie w polu do poprawienia.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending || pasted.trim() === ""} className="h-10">
              Dodaj gości z listy
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-10"
              onClick={() => {
                setShowPaste(false);
              }}
            >
              Anuluj
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="h-10 self-start"
          onClick={() => {
            setShowPaste(true);
          }}
        >
          Wklej listę gości
        </Button>
      )}
    </section>
  );
}
