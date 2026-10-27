import { useId, useRef, type ChangeEvent } from "react";
import { PLAN_IMAGE_TYPES } from "@/lib/venue/image";

interface Props {
  hasPlan: boolean;
  hasTables: boolean;
  pending: boolean;
  // Resolves to true when the plan was saved.
  onUpload: (file: File) => Promise<boolean>;
}

const REPLACE_QUESTION =
  "Wymienić plan? Pinezki stolików zostaną w tych samych miejscach obrazu — sprawdź je po wymianie planu.";

// Upload or replace the venue plan screenshot (FR-005): PNG, JPEG or WebP, at most 5 MB.
export function PlanUpload({ hasPlan, hasTables, pending, onUpload }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file && (!hasPlan || !hasTables || window.confirm(REPLACE_QUESTION))) {
      await onUpload(file);
    }
    // Let the same file be picked again after a failure or a cancelled confirm.
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <section aria-labelledby="plan-upload-heading" className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 id="plan-upload-heading" className="text-lg font-semibold">
        {hasPlan ? "Plan lokalu" : "Wgraj plan lokalu"}
      </h2>
      <p className="text-muted-foreground text-sm">
        Jeden zrzut ekranu z planem całego lokalu, na którym zaznaczysz stoliki. PNG, JPEG albo WebP, najwyżej 5 MB.
      </p>
      <div>
        <label
          htmlFor={inputId}
          className="border-input hover:bg-accent focus-within:ring-ring/50 inline-flex h-10 cursor-pointer items-center rounded-md border px-4 text-sm font-medium focus-within:ring-[3px]"
        >
          {pending ? "Wysyłanie…" : hasPlan ? "Wymień plan" : "Wybierz plik z planem"}
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={PLAN_IMAGE_TYPES.join(",")}
            className="sr-only"
            disabled={pending}
            onChange={(event) => void handleChange(event)}
          />
        </label>
      </div>
    </section>
  );
}
