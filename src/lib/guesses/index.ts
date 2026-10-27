// Guesses of the raise amount and the ranking (S-06). React islands import the pure modules (amount, ranking, board)
// directly, never this index (it also exports the DB services).
export {
  AMOUNT_EMPTY_MESSAGE,
  AMOUNT_INVALID_MESSAGE,
  AMOUNT_NEGATIVE_MESSAGE,
  AMOUNT_TOO_LARGE_MESSAGE,
  MAX_AMOUNT_GROSZE,
  describeDifference,
  formatAmount,
  formatAmountInput,
  parseAmount,
  type ParseAmountResult,
} from "./amount";
export { formatGuessSummary, toGuessBoard, type GuessBoardInput } from "./board";
export { placesFromLast, rankGuesses, type RankableGuess, type ReadoutStep } from "./ranking";
