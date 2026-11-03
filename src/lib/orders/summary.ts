import { formatAmount } from "@/lib/guesses/amount";
import type { Locale } from "@/lib/i18n";
import { pluralEn, pluralPl } from "@/lib/i18n/plural";
import type { OrderTotalsDto } from "@/types";

// Texts of the order counts (restaurant-orders), pure, in both languages (i18n).

export function describeLines(count: number, locale: Locale = "pl"): string {
  return locale === "en"
    ? `${count} ${pluralEn(count, "line", "lines")}`
    : `${count} ${pluralPl(count, "pozycja", "pozycje", "pozycji")}`;
}

// The shell card and the page header: „12 pozycji · 1 840,00 zł · wydane 3 z 15 szt.”.
export function formatOrderSummary(totals: OrderTotalsDto, locale: Locale = "pl"): string {
  if (totals.lines === 0) {
    return locale === "en" ? "No orders" : "Brak zamówień";
  }
  const delivered =
    locale === "en"
      ? `served ${totals.deliveredQuantity} of ${totals.quantity} pcs`
      : `wydane ${totals.deliveredQuantity} z ${totals.quantity} szt.`;
  return `${describeLines(totals.lines, locale)} · ${formatAmount(totals.totalGrosze)} · ${delivered}`;
}

// „Do wydania: 12 szt.” / „Wszystko wydane” for the restaurant.
export function describeToServe(toServe: number, quantity: number, locale: Locale = "pl"): string {
  if (locale === "en") {
    if (quantity === 0) {
      return "No orders";
    }
    return toServe === 0 ? "Everything served" : `To serve: ${toServe} of ${quantity} pcs`;
  }
  if (quantity === 0) {
    return "Brak zamówień";
  }
  return toServe === 0 ? "Wszystko wydane" : `Do wydania: ${toServe} z ${quantity} szt.`;
}
