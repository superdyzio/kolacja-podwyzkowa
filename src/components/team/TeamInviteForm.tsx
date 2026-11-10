import { useId, useState, type SubmitEvent } from "react";
import type { TeamRequest, TeamResult } from "@/components/hooks/useTeam";
import { StaffLinkCard } from "@/components/platform/StaffLinkCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authMessages, type StaffRole } from "@/lib/auth/messages";
import type { Locale } from "@/lib/i18n";
import { ownerInputProblem } from "@/lib/platform/messages";
import { OWNER_NAME_MAX, parseOwnerInput } from "@/lib/platform/rules";
import { teamMessages } from "@/lib/team/messages";
import type { TeamInviteResultDto } from "@/types";

interface Props {
  // The roles the person may invite as (inviteRoles of their role), never empty here.
  roles: readonly StaffRole[];
  pending: boolean;
  send: (request: TeamRequest) => Promise<TeamResult | null>;
  origin: string;
  locale: Locale;
}

const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-10 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]";

// „Zaproś do zespołu” (restaurant-team, S-12): e-mail, optional name and the role, checked with the server's rules;
// the answer shows the one-time invitation once (StaffLinkCard), or the note that the e-mail already has an account.
export function TeamInviteForm({ roles, pending, send, origin, locale }: Props) {
  const t = teamMessages(locale);
  const roleLabels = authMessages(locale).roleLabels;
  const id = useId();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>(roles.at(-1) ?? "waiter");
  const [problem, setProblem] = useState<string | null>(null);
  const [invited, setInvited] = useState<TeamInviteResultDto | null>(null);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const person = parseOwnerInput({ email, name });
    if (!person.ok) {
      setProblem(ownerInputProblem(person.reason, locale));
      return;
    }
    setProblem(null);
    const answer = await send({
      method: "POST",
      path: "",
      body: { email: person.email, name: person.displayName, role },
    });
    if (answer?.invited) {
      setInvited(answer.invited);
      setEmail("");
      setName("");
    }
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3 rounded-lg border p-3 sm:p-4">
      <h3 id={`${id}-heading`} className="font-semibold">
        {t.inviteHeading}
      </h3>
      <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)} noValidate>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-email`} className="font-medium">
            {t.emailLabel}
          </label>
          <Input
            id={`${id}-email`}
            type="email"
            autoComplete="off"
            value={email}
            maxLength={254}
            required
            aria-describedby={`${id}-email-hint`}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
          <p id={`${id}-email-hint`} className="text-muted-foreground text-sm">
            {t.emailHint}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-name`} className="font-medium">
            {t.nameLabel}
          </label>
          <Input
            id={`${id}-name`}
            type="text"
            autoComplete="off"
            value={name}
            maxLength={OWNER_NAME_MAX}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-role`} className="font-medium">
            {t.roleLabel}
          </label>
          <select
            id={`${id}-role`}
            value={role}
            onChange={(event) => {
              setRole(event.target.value as StaffRole);
            }}
            className={`${SELECT_CLASS} self-start`}
          >
            {roles.map((option) => (
              <option key={option} value={option}>
                {roleLabels[option]}
              </option>
            ))}
          </select>
        </div>
        {problem && (
          <p role="alert" className="text-destructive text-sm">
            {problem}
          </p>
        )}
        <Button type="submit" className="h-10 self-start" disabled={pending}>
          {t.inviteButton}
        </Button>
      </form>
      {invited && (
        <div aria-live="polite">
          {invited.link ? (
            <StaffLinkCard
              link={invited.link}
              email={invited.email}
              origin={origin}
              locale={locale}
              onDismiss={() => {
                setInvited(null);
              }}
            />
          ) : (
            <p role="status" className="bg-muted rounded-lg border p-3 text-sm">
              {t.hasAccount(invited.email)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
