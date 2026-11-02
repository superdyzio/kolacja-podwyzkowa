import { formatAmount } from "@/lib/guesses/amount";
import { pluralPl } from "@/lib/guests/summary";
import type { OrderTotalsDto } from "@/types";

// Polish texts of the order (restaurant-orders), pure.

export function describeLines(count: number): string {
  return `${count} ${pluralPl(count, "pozycja", "pozycje", "pozycji")}`;
}

// The shell card and the page header: „12 pozycji · 1 840,00 zł · wydane 3 z 15 szt.”.
export function formatOrderSummary(totals: OrderTotalsDto): string {
  if (totals.lines === 0) {
    return "Brak zamówień";
  }
  return `${describeLines(totals.lines)} · ${formatAmount(totals.totalGrosze)} · wydane ${totals.deliveredQuantity} z ${totals.quantity} szt.`;
}

// „Do wydania: 12 szt.” / „Wszystko wydane” for the restaurant.
export function describeToServe(toServe: number, quantity: number): string {
  if (quantity === 0) {
    return "Brak zamówień";
  }
  return toServe === 0 ? "Wszystko wydane" : `Do wydania: ${toServe} z ${quantity} szt.`;
}
