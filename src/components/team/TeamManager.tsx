import { useState } from "react";
import { useTeam } from "@/components/hooks/useTeam";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { inviteRoles, isLastOwner } from "@/lib/team/rules";
import { teamMessages } from "@/lib/team/messages";
import type { TeamDto } from "@/types";
import { TeamInviteForm } from "./TeamInviteForm";
import { TeamMemberRow } from "./TeamMemberRow";

interface Props {
  restaurantId: number;
  initial: TeamDto;
  // This request's origin: one-time links are built from it (https behind the Lambda proxy).
  origin: string;
  locale: Locale;
}

// The „Zespół” section of the restaurant page (restaurant-team, S-12) for owners and managers: who may do what, the
// invitation form and the members with the actions the viewer may take. The server decides every action again (the
// role matrix and the last-owner rule live in the database); this island only offers what the matrix allows.
export function TeamManager({ restaurantId, initial, origin, locale }: Props) {
  const t = teamMessages(locale);
  const { team, lost, pending, failure, send, dismissFailure } = useTeam(restaurantId, initial, locale);
  const [notice, setNotice] = useState<string | null>(null);

  if (lost) {
    return (
      <div className="flex flex-col gap-2" data-team-lost>
        <p role="status">{t.lost}</p>
        <a href="/panel" className="self-start py-2 text-sm underline underline-offset-4">
          {t.backToPanel}
        </a>
      </div>
    );
  }

  const roles = inviteRoles(team.you.role);

  return (
    <div className="flex flex-col gap-4" data-team-manager>
      <p className="text-sm">{t.intro}</p>
      <p className="text-muted-foreground text-sm">{team.you.role === "owner" ? t.ownerScope : t.managerScope}</p>
      {roles.length > 0 && (
        <TeamInviteForm roles={roles} pending={pending} send={send} origin={origin} locale={locale} />
      )}
      {failure && (
        <div role="alert" className="border-destructive/50 text-destructive flex flex-col gap-2 rounded-lg border p-3">
          <p className="text-sm">{failure.message}</p>
          <Button type="button" variant="ghost" className="h-10 self-start" onClick={dismissFailure}>
            {t.dismiss}
          </Button>
        </div>
      )}
      {notice && !failure && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">{t.listHeading(team.members.length)}</h3>
        <ul className="flex flex-col divide-y">
          {team.members.map((member) => (
            <TeamMemberRow
              key={member.accountId}
              member={member}
              you={team.you}
              lastOwner={isLastOwner(team.members, member.accountId)}
              pending={pending}
              send={send}
              onNotice={setNotice}
              origin={origin}
              locale={locale}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
