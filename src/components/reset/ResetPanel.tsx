import { useEffect, useId, useRef, useState } from "react";
import { useEventReset } from "@/components/hooks/useEventReset";
import { clearOfflineCache } from "@/components/hooks/offline-cache-store";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { resetMessages } from "@/lib/reset/messages";
import {
  expandResetParts,
  isEveryResetPartSelected,
  requiredBy,
  RESET_PARTS,
  resetPartDescriptions,
  resetPartLabels,
  selectAllResetParts,
  toggleResetPart,
} from "@/lib/reset/parts";
import { describeResetCount } from "@/lib/reset/summary";
import { cn } from "@/lib/utils";
import type { ResetPart } from "@/types";

interface Props {
  // The organizer API base, /api/o/<key>.
  apiBase: string;
  locale: Locale;
}

// „Reset danych” on the organizer shell: „Resetuj…” opens a modal (native <dialog>: the page behind is inert, Esc
// closes it) listing the parts with fresh counts. Parts pulled in by another chosen part are ticked and locked. One
// click on „Resetuj zaznaczone” resets — the modal is the confirmation. Afterwards it shows the summary, and closing it
// reloads the shell so every card shows the new state. While the reset runs, nothing closes the modal.
export function ResetPanel({ apiBase, locale }: Props) {
  const t = resetMessages(locale);
  const labels = resetPartLabels(locale);
  const descriptions = resetPartDescriptions(locale);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const closeAfterReset = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [explicit, setExplicit] = useState<ResetPart[]>([]);
  const { preview, loading, pending, failure, result, load, reset, forget } = useEventReset(apiBase, locale);
  const selected = expandResetParts(explicit);
  const everything = isEveryResetPartSelected(explicit);

  function reloadAfterReset() {
    // A sync that started before the reset could have saved old data meanwhile.
    clearOfflineCache(apiBase);
    window.location.reload();
  }

  function openDialog() {
    setExplicit([]);
    forget();
    setOpen(true);
    dialog.current?.showModal();
    void load();
  }

  function closeDialog() {
    if (!pending) {
      dialog.current?.close();
    }
  }

  // The dialog closed (a button or Esc).
  function onClosed() {
    setOpen(false);
    if (result) {
      reloadAfterReset();
    } else {
      opener.current?.focus();
    }
  }

  useEffect(() => {
    if (!result) {
      return;
    }
    if (dialog.current?.open) {
      closeAfterReset.current?.focus();
    } else {
      // Closed while the answer was on its way: the page shows old numbers.
      clearOfflineCache(apiBase);
      window.location.reload();
    }
  }, [result, apiBase]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <>
      <Button ref={opener} type="button" variant="outline" className="h-11 self-start" onClick={openDialog}>
        {t.open}
      </Button>

      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onCancel={(event) => {
          if (pending) {
            event.preventDefault();
          }
        }}
        onClose={onClosed}
        className="bg-background text-foreground m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border p-0 shadow-lg backdrop:bg-black/50"
      >
        {open && (
          <div className="flex flex-col gap-4 p-4 sm:p-6">
            <header className="flex flex-col gap-1">
              <h2 id={titleId} className="text-xl font-semibold">
                {t.title}
              </h2>
              <p className="text-muted-foreground text-sm">{t.intro}</p>
            </header>

            {result ? (
              <div className="flex flex-col gap-4" aria-live="polite">
                <p className="font-semibold">{t.done}</p>
                <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
                  {result.summary.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <Button ref={closeAfterReset} type="button" className="h-11" onClick={closeDialog}>
                  {t.close}
                </Button>
              </div>
            ) : (
              <>
                {loading && !preview && <p className="text-muted-foreground text-sm">{t.counting}</p>}

                <fieldset className="flex flex-col gap-2" disabled={pending}>
                  <legend className="sr-only">{t.legend}</legend>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="link"
                      className="h-9 px-0"
                      onClick={() => {
                        setExplicit(everything ? [] : selectAllResetParts());
                      }}
                    >
                      {everything ? t.deselectAll : t.selectAll}
                    </Button>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {RESET_PARTS.map((part) => {
                      const lockedBy = requiredBy(part, explicit);
                      const checked = selected.includes(part);
                      return (
                        <li key={part}>
                          <label
                            className={cn(
                              "flex cursor-pointer gap-3 rounded-lg border p-3",
                              checked && "border-destructive/50 bg-destructive/5",
                              lockedBy.length > 0 && "cursor-default",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="accent-destructive mt-0.5 size-5 shrink-0"
                              checked={checked}
                              disabled={lockedBy.length > 0}
                              onChange={() => {
                                setExplicit((current) => toggleResetPart(current, part));
                              }}
                            />
                            <span className="flex min-w-0 flex-col gap-1">
                              <span className="font-medium">{labels[part]}</span>
                              <span className="text-muted-foreground text-sm">{descriptions[part]}</span>
                              {lockedBy.length > 0 && (
                                <span className="text-sm">
                                  {t.requiredBy(lockedBy.map((other) => labels[other]).join(", "))}
                                </span>
                              )}
                              {part === "guestLinks" && selected.includes("guests") && (
                                <span className="text-sm">{t.guestLinksWithGuestsNote}</span>
                              )}
                              <span className="text-sm font-medium break-words">
                                {preview
                                  ? describeResetCount(part, preview.counts, preview.starterQuestions, locale)
                                  : loading
                                    ? "…"
                                    : t.countsUnavailable}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>

                {failure && (
                  <div role="alert" className="text-destructive flex flex-col gap-2 text-sm">
                    <p>{failure.message}</p>
                    {failure.details.length > 0 && (
                      <ul className="list-disc pl-5">
                        {failure.details.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    )}
                    {!preview && !loading && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 self-start"
                        onClick={() => {
                          void load();
                        }}
                      >
                        {t.retry}
                      </Button>
                    )}
                  </div>
                )}

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" className="h-11" disabled={pending} onClick={closeDialog}>
                    {t.cancel}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="h-11"
                    disabled={selected.length === 0 || pending}
                    onClick={() => {
                      void reset(selected);
                    }}
                  >
                    {pending ? t.resetting : t.resetSelected}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
