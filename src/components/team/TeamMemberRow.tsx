import { useId, useState } from "react";
import type { TeamRequest, TeamResult } from "@/components/hooks/useTeam";
import { StaffLinkCard } from "@/components/platform/StaffLinkCard";
import { Button } from "@/components/ui/button";
import { authMessages, type StaffRole } from "@/lib/auth/messages";
import type { Locale } from "@/lib/i18n";
import { assignableRoles, canManageMember } from "@/lib/team/rules";
import { teamMessages } from "@/lib/team/messages";
import type { StaffLinkDto, TeamMemberDto } from "@/types";

interface Props {
  member: TeamMemberDto;
  you: { accountId: number; role: StaffRole };
  // The member is the restaurant's only owner (neither demoted nor removed; the server refuses it too).
  lastOwner: boolean;
  pending: boolean;
  send: (request: TeamRequest) => Promise<TeamResult | null>;
  onNotice: (text: string) => void;
  origin: string;
  locale: Locale;
}

const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-10 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]";

// One person in the team (restaurant-team, S-12): name, e-mail, account state, role — and only the actions the viewer
// may take on them (canManageMember): the role select (when there is more than one role to give), „Usuń z zespołu”
// and „Nowy link” (not on the viewer's own row: they change their password in the panel). Every action asks first.
export function TeamMemberRow({ member, you, lastOwner, pending, send, onNotice, origin, locale }: Props) {
  const t = teamMessages(locale);
  const roleLabels = authMessages(locale).roleLabels;
  const id = useId();
  const [link, setLink] = useState<StaffLinkDto | null>(null);
  const isYou = member.accountId === you.accountId;
  const manageable = canManageMember(you.role, member.role);
  const roles = assignableRoles(you.role);
  const path = `/${String(member.accountId)}`;

  async function changeRole(role: StaffRole) {
    if (role === member.role) {
      return;
    }
    const message =
      isYou && member.role === "owner"
        ? t.confirmDemoteSelf(roleLabels[role])
        : role === "owner"
          ? t.confirmPromoteOwner(member.email)
          : t.confirmRole(member.email, roleLabels[role]);
    if (!window.confirm(message)) {
      return;
    }
    if (await send({ method: "PATCH", path, body: { role } })) {
      onNotice(t.roleChanged(member.email, roleLabels[role]));
    }
  }

  async function remove() {
    if (!window.confirm(isYou ? t.confirmRemoveSelf : t.confirmRemove(member.email))) {
      return;
    }
    if (await send({ method: "DELETE", path })) {
      onNotice(t.removed(member.email));
    }
  }

  async function newLink() {
    if (!window.confirm(t.confirmNewLink(member.email))) {
      return;
    }
    const answer = await send({ method: "POST", path: `${path}/link` });
    if (answer?.link) {
      setLink(answer.link);
    }
  }

  return (
    <li className="flex flex-col gap-2 py-3" data-member-id={member.accountId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-col">
          <span className="font-medium">
            {member.displayName ? `${member.displayName} · ` : ""}
            {member.email}
            {isYou && <span className="ml-2 rounded-full border px-2 py-0.5 text-xs">{t.you}</span>}
          </span>
          <span className="text-muted-foreground text-sm">
            {member.hasPassword ? t.accountActive : t.accountPending}
          </span>
        </span>
        {manageable && roles.length > 1 ? (
          <span className="flex flex-col items-end gap-1">
            <label htmlFor={`${id}-role`} className="sr-only">
              {t.roleSelectLabel(member.email)}
            </label>
            <select
              id={`${id}-role`}
              value={member.role}
              disabled={pending}
              onChange={(event) => void changeRole(event.target.value as StaffRole)}
              className={SELECT_CLASS}
            >
              {roles.map((option) => (
                <option key={option} value={option} disabled={lastOwner && option !== "owner"}>
                  {roleLabels[option]}
                </option>
              ))}
            </select>
          </span>
        ) : (
          <span className="rounded-full border px-2 py-0.5 text-sm">{roleLabels[member.role]}</span>
        )}
      </div>
      {manageable && lastOwner && <p className="text-muted-foreground text-sm">{t.lastOwnerHint}</p>}
      {manageable && (
        <div className="flex flex-wrap gap-2">
          {!isYou && (
            <Button
              type="button"
              variant="outline"
              className="h-10"
              disabled={pending}
              aria-label={t.newLinkLabel(member.email)}
              onClick={() => void newLink()}
            >
              {t.newLink}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            className="h-10"
            disabled={pending || lastOwner}
            aria-label={t.removeLabel(member.email)}
            onClick={() => void remove()}
          >
            {t.remove}
          </Button>
        </div>
      )}
      {link && (
        <StaffLinkCard
          link={link}
          email={member.email}
          origin={origin}
          locale={locale}
          onDismiss={() => {
            setLink(null);
          }}
        />
      )}
    </li>
  );
}
