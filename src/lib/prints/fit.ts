// Room prints (room-prints, S-24), pure: a font size that keeps a name on its card. Printed text cannot be measured on
// the server, so the size shrinks with the number of characters: `basePt` up to `charsAtBase` characters, then in
// proportion, never below `minPt` (where the text may wrap to a second line).
export function fitFontPt(text: string, basePt: number, minPt: number, charsAtBase: number): number {
  const length = Math.max(Array.from(text).length, 1);
  if (length <= charsAtBase) {
    return basePt;
  }
  const size = (basePt * charsAtBase) / length;
  return Math.max(minPt, Math.round(size * 10) / 10);
}
