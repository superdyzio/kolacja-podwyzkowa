// Plural forms (i18n), pure. Polish has three (1 pozycja, 2–4 pozycje, 5+ pozycji, but 22 pozycje); English two.

export function pluralPl(count: number, one: string, few: string, many: string): string {
  if (count === 1) {
    return one;
  }
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return few;
  }
  return many;
}

export function pluralEn(count: number, one: string, other: string): string {
  return count === 1 ? one : other;
}
