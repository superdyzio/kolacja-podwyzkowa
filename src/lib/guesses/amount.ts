// Money for the raise-amount guesses (S-06, FR-017, FR-020), pure. Amounts are integer grosze end to end
// (1 zł = 100 gr): parsing is string and integer math only (never parseFloat × 100), and formatting is hand-rolled so
// the server (workerd), the tests (Node) and every phone print exactly the same text — Intl's pl-PL format does not
// group 4-digit numbers ("1500") and its separators depend on the runtime's ICU data.

// 10 000 000,00 zł — far above any raise, low enough to catch a slipped finger (and to fit a Postgres integer).
export const MAX_AMOUNT_GROSZE = 1_000_000_000;

export const AMOUNT_EMPTY_MESSAGE = "Wpisz kwotę.";
export const AMOUNT_NEGATIVE_MESSAGE = "Kwota nie może być ujemna.";
export const AMOUNT_INVALID_MESSAGE = "Wpisz kwotę w złotych, np. 1500 albo 1499,99.";
export const AMOUNT_TOO_LARGE_MESSAGE = "Kwota może wynieść najwyżej 10 000 000 zł.";

export type ParseAmountResult = { ok: true; grosze: number } | { ok: false; message: string };

// Non-breaking space: keeps "1 499,99 zł" on one line.
const NBSP = "\u00a0";
// Ordinary, non-breaking, narrow non-breaking and thin spaces (what keyboards, spreadsheets and Intl produce).
const SPACES = /[ \t\u00a0\u202f\u2009]/g;
const CURRENCY_SUFFIX = /(?:zł|zl|pln)$/i;
// "1500,-" — the Polish way of writing a whole amount.
const WHOLE_SUFFIX = /[.,]-$/;
// Whole złoty, then optionally a comma or dot with one or two digits of grosze. "1.500" (3 digits) is refused on
// purpose: it could be 1,5 zł or 1500 zł.
const AMOUNT = /^(\d+)(?:[.,](\d{1,2}))?$/;
// More złoty digits than 10 000 000 has (8) can only be too large; checked before Number() to keep it exact.
const MAX_WHOLE_DIGITS = 8;

function failure(message: string): ParseAmountResult {
  return { ok: false, message };
}

// Reads an amount the way people type it on a phone: "1500", "1 500", "1499,99", "1499.99", "1 499,99 zł",
// "1500 PLN", "1500,-". Returns integer grosze (0 … MAX_AMOUNT_GROSZE) or a Polish message for the field.
export function parseAmount(text: string): ParseAmountResult {
  let value = text.trim();
  if (value === "") {
    return failure(AMOUNT_EMPTY_MESSAGE);
  }
  value = value.replace(CURRENCY_SUFFIX, "").trim().replace(WHOLE_SUFFIX, "").replace(SPACES, "");
  if (value.startsWith("-") || value.startsWith("\u2212")) {
    return failure(AMOUNT_NEGATIVE_MESSAGE);
  }
  if (!AMOUNT.test(value)) {
    return failure(AMOUNT_INVALID_MESSAGE);
  }
  const [wholeDigits = "", fractionDigits = ""] = value.split(/[.,]/);
  const whole = wholeDigits.replace(/^0+(?=\d)/, "");
  if (whole.length > MAX_WHOLE_DIGITS) {
    return failure(AMOUNT_TOO_LARGE_MESSAGE);
  }
  const fraction = fractionDigits.padEnd(2, "0");
  const grosze = Number(whole) * 100 + Number(fraction);
  if (grosze > MAX_AMOUNT_GROSZE) {
    return failure(AMOUNT_TOO_LARGE_MESSAGE);
  }
  return { ok: true, grosze };
}

function splitGrosze(grosze: number): { sign: string; whole: string; fraction: string } {
  const absolute = Math.abs(Math.trunc(grosze));
  return {
    sign: grosze < 0 ? "-" : "",
    whole: String(Math.floor(absolute / 100)),
    fraction: String(absolute % 100).padStart(2, "0"),
  };
}

// Groups every three digits with a non-breaking space, 4-digit numbers included ("1 500").
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

// The canonical display: "1 499,99 zł" (non-breaking spaces, always two decimals).
export function formatAmount(grosze: number): string {
  const { sign, whole, fraction } = splitGrosze(grosze);
  return `${sign}${groupThousands(whole)},${fraction}${NBSP}zł`;
}

// What an edit field is prefilled with: "1500" for whole amounts, else "1499,99" (no grouping, parses back).
export function formatAmountInput(grosze: number): string {
  const { sign, whole, fraction } = splitGrosze(grosze);
  return fraction === "00" ? `${sign}${whole}` : `${sign}${whole},${fraction}`;
}

// How far a guess is from the correct amount, for reading aloud: "dokładnie!", "o 50,00 zł za mało",
// "o 50,00 zł za dużo". differenceGrosze = guess - correct.
export function describeDifference(differenceGrosze: number): string {
  if (differenceGrosze === 0) {
    return "dokładnie!";
  }
  return differenceGrosze < 0
    ? `o ${formatAmount(-differenceGrosze)} za mało`
    : `o ${formatAmount(differenceGrosze)} za dużo`;
}
