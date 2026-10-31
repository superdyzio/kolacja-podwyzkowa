// Server-safe exports of the guest links module. qr.ts is intentionally NOT exported here: it is browser-only (the
// card sheet's client script imports it directly), so `qrcode` never reaches the server bundle.
export { LOCAL_ORIGIN_WARNING, guestUrl, isLocalOrigin } from "./links";
export {
  GUEST_UNPUBLISHED_MESSAGE,
  GUEST_UNSEATED_MESSAGE,
  describeGuestSeat,
  guestStateVersion,
  toGuestState,
  type GuestStateInput,
} from "./state";
export { formatGuestAccess, formatGuestLinksSummary, type GuestLinksSummary } from "./summary";
export {
  getGuestAccessEnabled,
  getGuestLinks,
  getGuestState,
  getGuestStateVersion,
  revokeGuestKey,
  setGuestAccess,
  type RevokeGuestKeyResult,
} from "./service";
