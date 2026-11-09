import { useId, useState, type SubmitEvent } from "react";
import type { PlatformAnswer, PlatformRequest } from "@/components/hooks/usePlatformRestaurants";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { ownerInputProblem, platformMessages } from "@/lib/platform/messages";
import { parseOwnerInput } from "@/lib/platform/rules";
import { formatRestaurantCounters } from "@/lib/platform/summary";
import { cn } from "@/lib/utils";
import type { OwnerResultDto, PlatformRestaurantDto, StaffLinkDto } from "@/types";
import { OwnerFields } from "./OwnerFields";
import { OwnerResult } from "./OwnerResult";
import { StaffLinkCard } from "./StaffLinkCard";

interface Props {
  restaurant: PlatformRestaurantDto;
  pending: boolean;
  send: (request: PlatformRequest) => Promise<PlatformAnswer | null>;
  origin: string;
  locale: Locale;
}

// One restaurant in the platform list (platform-restaurants, S-10): status, counters, owners with their account state
// and „Nowy link”, „Dodaj właściciela”, „Wyłącz” / „Włącz”. Counters only — never the restaurant's events or guests.
export function PlatformRestaurantCard({ restaurant, pending, send, origin, locale }: Props) {
  const t = platformMessages(locale);
  const id = useId();
  const [ownerLink, setOwnerLink] = useState<{ accountId: number; link: StaffLinkDto } | null>(null);
  const [email, setEmail] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [added, setAdded] = useState<OwnerResultDto | null>(null);

  async function newLink(accountId: number, ownerEmail: string) {
    if (!window.confirm(t.confirmNewLink(ownerEmail))) {
      return;
    }
    const answer = await send({
      method: "POST",
      path: `/${String(restaurant.id)}/owners/${String(accountId)}/link`,
    });
    if (answer?.link) {
      setOwnerLink({ accountId, link: answer.link });
    }
  }

  async function toggle() {
    const message = restaurant.disabled ? t.confirmEnable(restaurant.name) : t.confirmDisable(restaurant.name);
    if (!window.confirm(message)) {
      return;
    }
    await send({ method: "PATCH", path: `/${String(restaurant.id)}`, body: { disabled: !restaurant.disabled } });
  }

  async function addOwner(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const owner = parseOwnerInput({ email, name: ownerName });
    if (!owner.ok) {
      setProblem(ownerInputProblem(owner.reason, locale));
      return;
    }
    setProblem(null);
    const answer = await send({
      method: "POST",
      path: `/${String(restaurant.id)}/owners`,
      body: { email: owner.email, name: owner.displayName },
    });
    if (answer?.owner) {
      setAdded(answer.owner);
      setEmail("");
      setOwnerName("");
    }
  }

  return (
    <li
      className={cn("flex flex-col gap-3 rounded-xl border p-4", restaurant.disabled && "bg-muted/40 border-dashed")}
      data-restaurant-id={restaurant.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{restaurant.name}</h3>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-sm",
            restaurant.disabled ? "border-destructive/50 text-destructive" : "border-primary/40",
          )}
        >
          {restaurant.disabled ? t.disabled : t.active}
        </span>
      </div>
      <p className="text-muted-foreground text-sm">{formatRestaurantCounters(restaurant, locale)}</p>
      {restaurant.disabled && <p className="text-sm">{t.disabledHint}</p>}

      <div className="flex flex-col gap-2">
        <h4 className="font-medium">{t.ownersHeading}</h4>
        {restaurant.owners.length === 0 ? (
          <p className="text-destructive text-sm font-medium">{t.noOwner}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {restaurant.owners.map((owner) => (
              <li key={owner.accountId} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {owner.displayName ? `${owner.displayName} · ` : ""}
                    {owner.email}{" "}
                    <span className="text-muted-foreground text-sm">
                      ({owner.hasPassword ? t.accountActive : t.accountPending})
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    disabled={pending}
                    aria-label={t.newLinkFor(owner.email)}
                    onClick={() => void newLink(owner.accountId, owner.email)}
                  >
                    {t.newLink}
                  </Button>
                </div>
                {ownerLink?.accountId === owner.accountId && (
                  <StaffLinkCard
                    link={ownerLink.link}
                    email={owner.email}
                    origin={origin}
                    locale={locale}
                    onDismiss={() => {
                      setOwnerLink(null);
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className="rounded-lg border p-3" open={restaurant.owners.length === 0}>
        <summary className="cursor-pointer font-medium">{t.addOwnerHeading}</summary>
        <form className="mt-3 flex flex-col gap-3" onSubmit={(event) => void addOwner(event)} noValidate>
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
          <Button type="submit" variant="outline" className="h-10 self-start" disabled={pending}>
            {t.addOwnerButton}
          </Button>
        </form>
        {added && (
          <div className="mt-3" aria-live="polite">
            <OwnerResult
              owner={added}
              origin={origin}
              locale={locale}
              onDismiss={() => {
                setAdded(null);
              }}
            />
          </div>
        )}
      </details>

      <div>
        <Button
          type="button"
          variant={restaurant.disabled ? "default" : "ghost"}
          className="h-10"
          disabled={pending}
          aria-label={restaurant.disabled ? t.enableLabel(restaurant.name) : t.disableLabel(restaurant.name)}
          onClick={() => void toggle()}
        >
          {restaurant.disabled ? t.enable : t.disable}
        </Button>
      </div>
    </li>
  );
}
