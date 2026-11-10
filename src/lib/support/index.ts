// The platform admin's support access and its log (admin-support-log, S-13). Server side (with the DB service);
// islands import ./rules, ./messages and ./format directly.
export { EnterSupportBody } from "./api";
export { describeSupportEntry, formatSupportClock, formatSupportTime } from "./format";
export { supportMessages } from "./messages";
export {
  isApiPath,
  isReadMethod,
  loggedPath,
  normalizeSupportReason,
  parseSupportReason,
  SUPPORT_LOG_LIMIT,
  SUPPORT_LOG_ROLES,
  SUPPORT_MINUTES,
  SUPPORT_PATH_MAX,
  SUPPORT_REASON_MAX,
  SUPPORT_REASON_MIN,
  SUPPORT_ROLE,
  supportArea,
  supportEventSummary,
  supportStartPath,
  type SupportArea,
  type SupportReasonProblem,
  type SupportReasonResult,
} from "./rules";
export {
  beginSupport,
  endSupport,
  getSupportLog,
  listActiveSupport,
  recordSupportAccess,
  SupportError,
  type BeginSupportResult,
  type SupportAccess,
  type SupportTarget,
} from "./service";
