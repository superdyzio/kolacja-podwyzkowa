import { useId, useState, type SubmitEvent } from "react";
import type { PlatformAnswer, PlatformRequest } from "@/components/hooks/usePlatformRestaurants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/lib/i18n";
import { ownerInputProblem, platformMessages, restaurantNameProblem } from "@/lib/platform/messages";
import { parseOwnerInput, parseRestaurantName, RESTAURANT_NAME_MAX } from "@/lib/platform/rules";
import type { OwnerResultDto } from "@/types";
import { OwnerFields } from "./OwnerFields";
import { OwnerResult } from "./OwnerResult";

interface Props {
  pending: boolean;
  send: (request: PlatformRequest) => Promise<PlatformAnswer | null>;
  origin: string;
  locale: Locale;
}

// „Nowa restauracja” (platform-restaurants, S-10): name + owner's e-mail (+ optional name) → the restaurant with its
// owner, then the owner's one-time invitation shown once under the form.
export function NewRestaurantForm({ pending, send, origin, locale }: Props) {
  const t = platformMessages(locale);
  const id = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<{ restaurant: string; owner: OwnerResultDto } | null>(null);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedName = parseRestaurantName(name);
    if (!parsedName.ok) {
      setProblem(restaurantNameProblem(parsedName.reason, locale));
      return;
    }
    const owner = parseOwnerInput({ email, name: ownerName });
    if (!owner.ok) {
      setProblem(ownerInputProblem(owner.reason, locale));
      return;
    }
    setProblem(null);
    const answer = await send({
      method: "POST",
      path: "",
      body: { name: parsedName.name, ownerEmail: owner.email, ownerName: owner.displayName },
    });
    if (answer?.owner) {
      setResult({ restaurant: parsedName.name, owner: answer.owner });
      setName("");
      setEmail("");
      setOwnerName("");
    }
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-4 rounded-xl border p-4 sm:p-6">
      <h2 id={`${id}-heading`} className="text-xl font-semibold">
        {t.newHeading}
      </h2>
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)} noValidate>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-name`} className="font-medium">
            {t.nameLabel}
          </label>
          <Input
            id={`${id}-name`}
            type="text"
            autoComplete="off"
            value={name}
            maxLength={RESTAURANT_NAME_MAX}
            required
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </div>
        <OwnerFields
          idPrefix={`${id}-owner`}
          email={email}
          name={ownerName}
          onEmail={setEmail}
          onName={setOwnerName}
          locale={locale}
        />
        {problem && (
          <p role="alert" className="text-destructive text-sm">
            {problem}
          </p>
        )}
        <Button type="submit" className="h-10 self-start" disabled={pending}>
          {t.createButton}
        </Button>
      </form>
      {result && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <p className="font-medium">{t.created(result.restaurant)}</p>
          <OwnerResult
            owner={result.owner}
            origin={origin}
            locale={locale}
            onDismiss={() => {
              setResult(null);
            }}
          />
        </div>
      )}
    </section>
  );
}
