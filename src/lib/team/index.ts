// The restaurant team in the panel (restaurant-team, S-12). Server only: the service issues one-time links
// (node:crypto). Islands import ./rules and ./messages directly.
export { InviteMemberBody, UpdateMemberBody } from "./api";
export { teamMessages } from "./messages";
export {
  assignableRoles,
  canManageMember,
  canManageTeam,
  INVITE_ROLES,
  inviteRoles,
  isLastOwner,
  MANAGED_ROLES,
  ownerCount,
  sortTeam,
  TEAM_ROLES,
} from "./rules";
export {
  getTeam,
  inviteMember,
  issueMemberLink,
  removeMember,
  setMemberRole,
  teamFor,
  TeamError,
  type InviteResult,
  type MemberChangeResult,
  type MemberInput,
  type MemberLinkResult,
  type TeamViewer,
} from "./service";
