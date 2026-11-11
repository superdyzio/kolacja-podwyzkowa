import { useId, useState, type ChangeEvent, type SubmitEvent } from "react";
import { DietBadges } from "@/components/diets/DietBadges";
import { useGuestImport } from "@/components/hooks/useGuestImport";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { dietMessages } from "@/lib/diets/messages";
import { DIET_TAGS } from "@/lib/diets/rules";
import { MAX_IMPORT_TEXT_LENGTH } from "@/lib/guests/import";
import { guestManagerMessages, guestsMessages } from "@/lib/guests/messages";
import type { Locale } from "@/lib/i18n";

interface Props {
  // Organizer API base (the client's link or the panel dispatcher's).
  apiBase: string;
  pending: boolean;
  // Saves the import (POST /guests/import { text }); resolves to true when the guests were added.
  onSave: (text: string) => Promise<boolean>;
  locale: Locale;
}

// The browser reads at most this many bytes of a file (a UTF-8 character is at most 4 bytes; the server's text limit
// decides the rest).
const MAX_FILE_BYTES = MAX_IMPORT_TEXT_LENGTH * 4;

// A spreadsheet's CSV is UTF-8 (often with a BOM) or, from a Polish Excel, Windows-1250. UTF-8 is tried strictly first;
// anything that is not valid UTF-8 is read as Windows-1250, so „Żółć” survives both.
function decodeFile(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1250").decode(bytes);
  }
}

// Import of guests with diets (guest-import-diets, S-23; FR-035): a CSV file or a spreadsheet paste (name, diet, notes)
// → „Sprawdź” shows what the server would add and every problem by line → „Dodaj N gości” saves all or nothing.
// Editing the text drops the preview, so what is saved is always what was checked.
export function GuestImportForm({ apiBase, pending, onSave, locale }: Props) {
  const t = guestManagerMessages(locale);
  const fileId = useId();
  const textId = useId();
  const hintId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const importer = useGuestImport(apiBase, locale);
  const { preview } = importer;
  const diets = dietMessages(locale);
  const dietList = DIET_TAGS.map((tag) => diets.labels[tag]).join(", ");

  function changeText(next: string) {
    setText(next);
    setLoaded(null);
    setAdded(null);
    importer.clear();
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (file === undefined) {
      return;
    }
    setAdded(null);
    if (file.size > MAX_FILE_BYTES) {
      importer.fail(guestsMessages(locale).importTooLarge);
      return;
    }
    try {
      const decoded = decodeFile(await file.arrayBuffer());
      if (decoded.length > MAX_IMPORT_TEXT_LENGTH) {
        importer.fail(guestsMessages(locale).importTooLarge);
        return;
      }
      setText(decoded);
      setLoaded(file.name);
      importer.clear();
      void importer.check(decoded);
    } catch {
      importer.fail(t.importFileFailed);
    }
  }

  function submitCheck(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (text.length > MAX_IMPORT_TEXT_LENGTH) {
      importer.fail(guestsMessages(locale).importTooLarge);
      return;
    }
    void importer.check(text);
  }

  async function save() {
    if (!preview?.ready) {
      return;
    }
    const count = preview.rows.length;
    if (await onSave(text)) {
      setText("");
      setLoaded(null);
      importer.clear();
      setAdded(count);
    }
  }

  return (
    <section
      data-guest-import=""
      aria-labelledby={`${fileId}-heading`}
      className="flex flex-col gap-3 rounded-xl border p-4"
    >
      <h2 id={`${fileId}-heading`} className="text-lg font-semibold">
        {t.importHeading}
      </h2>
      {added !== null && (
        <p role="status" className="text-sm font-medium text-green-700 dark:text-green-400">
          {t.importAdded(added)}
        </p>
      )}
      {!open ? (
        <Button
          type="button"
          variant="outline"
          className="h-10 self-start"
          onClick={() => {
            setOpen(true);
          }}
        >
          {t.importOpen}
        </Button>
      ) : (
        <form onSubmit={submitCheck} className="flex flex-col gap-3" aria-describedby={hintId}>
          <p id={hintId} className="text-muted-foreground text-sm">
            {t.importHint(dietList)}
          </p>
          <div className="flex flex-col gap-1">
            <label htmlFor={fileId} className="text-sm font-medium">
              {t.importFileLabel}
            </label>
            <input
              id={fileId}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              disabled={pending}
              onChange={(event) => void readFile(event)}
              className="file:bg-secondary file:text-secondary-foreground text-sm file:mr-3 file:h-10 file:rounded-md file:border-0 file:px-3"
            />
            {loaded !== null && <p className="text-muted-foreground text-xs">{t.importFileLoaded(loaded)}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={textId} className="text-sm font-medium">
              {t.importTextLabel}
            </label>
            <Textarea
              id={textId}
              value={text}
              onChange={(event) => {
                changeText(event.target.value);
              }}
              rows={8}
              placeholder={t.importPlaceholder}
              className="max-h-[50vh] font-mono text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="secondary"
              className="h-10"
              disabled={pending || importer.checking || text.trim() === ""}
            >
              {importer.checking ? t.importChecking : t.importCheck}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-10"
              onClick={() => {
                changeText("");
                setOpen(false);
              }}
            >
              {t.cancel}
            </Button>
          </div>

          {importer.failure && (
            <div role="alert" className="border-destructive/50 bg-destructive/5 rounded-lg border p-3 text-sm">
              <p className="text-destructive font-medium">{importer.failure.message}</p>
              {importer.failure.details.length > 0 && (
                <ul className="list-disc pl-5">
                  {importer.failure.details.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {preview && (
            <div data-guest-import-preview={preview.ready ? "ready" : "problems"} className="flex flex-col gap-3">
              <p className="text-muted-foreground text-xs">
                {t.importDetected(t.importSeparators[preview.separator], preview.header)}
              </p>
              {preview.problems.length > 0 && (
                <div role="alert" className="border-destructive/50 bg-destructive/5 rounded-lg border p-3 text-sm">
                  <p className="text-destructive font-medium">{t.importProblems(preview.problems.length)}</p>
                  <ul className="list-disc pl-5">
                    {preview.problems.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.rows.length > 0 && (
                <>
                  <h3 className="font-semibold">{t.importPreviewHeading(preview.rows.length)}</h3>
                  <div className="max-h-[50vh] overflow-auto rounded-lg border">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th scope="col" className="px-2 py-1 font-medium">
                            {t.importLine}
                          </th>
                          <th scope="col" className="px-2 py-1 font-medium">
                            {t.importName}
                          </th>
                          <th scope="col" className="px-2 py-1 font-medium">
                            {t.importDiet}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((row) => (
                          <tr key={row.line} data-import-row={row.line} className="border-t align-top">
                            <td className="text-muted-foreground px-2 py-1 tabular-nums">{row.line}</td>
                            <td className="px-2 py-1 font-medium">{row.name}</td>
                            <td className="px-2 py-1">
                              <DietBadges diets={row.diets} note={row.note} locale={locale} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <Button
                type="button"
                className="h-10 self-start"
                disabled={pending || !preview.ready}
                onClick={() => void save()}
              >
                {t.importSave(preview.rows.length)}
              </Button>
            </div>
          )}
        </form>
      )}
    </section>
  );
}
