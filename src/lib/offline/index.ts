// The organizer's offline readout (S-09): pure modules only. React islands import the modules directly.
export {
  OFFLINE_CACHE_VERSION,
  OFFLINE_GUESSES_STORAGE_KEY,
  OFFLINE_SEATING_STORAGE_KEY,
  isGuessBoardData,
  isPublishedSeating,
  offlineEntry,
  offlineOwner,
  ownEntry,
  parseOfflineGuesses,
  parseOfflineSeating,
  serializeOfflineEntry,
  type OfflineEntry,
  type OfflineGuessesEntry,
  type OfflineSeatingEntry,
} from "./cache";
export {
  findGuestSeats,
  formatPublishedLabel,
  formatSavedAt,
  latestSavedAt,
  normalizeSearch,
  offlineRanking,
  seatingByRoom,
  type GuestSeatMatch,
  type ReadoutRoom,
  type ReadoutSeat,
  type ReadoutTable,
} from "./readout";
export { offlineMessages } from "./messages";
export { readOfflineState, type FetchFunction, type OfflineReadResult } from "./sync";
// The staff's offline readout (staff-offline-readout, S-27).
export {
  STAFF_READOUT_AREAS,
  STAFF_READOUT_PATH_PREFIXES,
  STAFF_READOUT_STORAGE_KEYS,
  STAFF_READOUT_VERSION,
  floorReadoutScope,
  isAppDenial,
  isStaffReadout,
  isStaffReadoutApiBase,
  isStaffReadoutWindowOpen,
  liveStaffEntry,
  parseStaffOfflineEntry,
  readStaffReadoutOnce,
  serializeStaffOfflineEntry,
  staffOfflineEntry,
  staffReadoutFromBoard,
  staffReadoutFromView,
  staffReadoutOwner,
  tabletReadoutScope,
  waiterReadoutScope,
  type StaffOfflineEntry,
  type StaffReadResult,
  type StaffReadoutArea,
  type StaffReadoutScope,
} from "./staff";
export { staffOfflineMessages } from "./staff-messages";
