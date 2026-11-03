import { useId, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { guestManagerMessages } from "@/lib/guests/messages";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/guests/names";
import type { Locale } from "@/lib/i18n";

interface Props {
  pending: boolean;
  // Adds the guests from the text (one per line); resolves to true when they were saved.
  onAdd: (text: string) => Promise<boolean>;
  locale: Locale;
}

// Adding guests: one name at a time, or a pasted list (FR-001). A failed paste keeps the text so it can be fixed.
export function GuestAddForms({ pending, onAdd, locale }: Props) {
  const t = guestManagerMessages(locale);
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
        {t.addHeading}
      </h2>

      <form onSubmit={submitSingle} className="flex flex-col gap-2">
        <label htmlFor={singleId} className="text-sm font-medium">
          {t.nameLabel}
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
            placeholder={t.namePlaceholder}
            className="h-10"
          />
          <Button type="submit" disabled={pending || name.trim() === ""} className="h-10">
            {t.add}
          </Button>
        </div>
      </form>

      {showPaste ? (
        <form onSubmit={submitPaste} className="flex flex-col gap-2">
          <label htmlFor={pasteId} className="text-sm font-medium">
            {t.pasteLabel}
          </label>
          <Textarea
            id={pasteId}
            value={pasted}
            onChange={(event) => {
              setPasted(event.target.value);
            }}
            rows={8}
            placeholder={t.pastePlaceholder}
            className="max-h-[50vh]"
          />
          <p className="text-muted-foreground text-sm">{t.pasteHint}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending || pasted.trim() === ""} className="h-10">
              {t.addFromList}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-10"
              onClick={() => {
                setShowPaste(false);
              }}
            >
              {t.cancel}
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
          {t.pasteList}
        </Button>
      )}
    </section>
  );
}
