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
