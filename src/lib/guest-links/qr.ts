import QRCode from "qrcode";

// QR codes of personal guest links (S-05 cards). BROWSER ONLY in the app: the card sheet fills its placeholders on
// the client, because ~40 codes would blow the Worker's CPU budget and pull `qrcode` into the server bundle. Never
// import this module from server code (it is deliberately not re-exported from `@/lib/guest-links`).
//
// Error correction M (15%) survives a crease or a smudge on a printed card; the 4-module quiet zone is the minimum
// the QR standard asks for around the symbol.

export const QR_QUIET_ZONE = 4;

export interface QrMatrix {
  // Modules per side (without the quiet zone).
  size: number;
  // x = column, y = row, both from the top-left corner.
  isDark(x: number, y: number): boolean;
}

export function qrMatrix(text: string): QrMatrix {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const { size, data } = modules;
  return { size, isDark: (x, y) => data[y * size + x] === 1 };
}

// One SVG path of every dark module, as horizontal runs of unit squares, offset by the quiet zone.
export function qrSvgPath(matrix: QrMatrix, quietZone = QR_QUIET_ZONE): string {
  const parts: string[] = [];
  for (let y = 0; y < matrix.size; y++) {
    let x = 0;
    while (x < matrix.size) {
      if (!matrix.isDark(x, y)) {
        x++;
        continue;
      }
      const start = x;
      while (x < matrix.size && matrix.isDark(x, y)) {
        x++;
      }
      const run = x - start;
      parts.push(`M${start + quietZone} ${y + quietZone}h${run}v1h-${run}z`);
    }
  }
  return parts.join("");
}

// The square view box: the symbol plus the quiet zone on every side.
export function qrViewBox(matrix: QrMatrix, quietZone = QR_QUIET_ZONE): string {
  const side = matrix.size + 2 * quietZone;
  return `0 0 ${side} ${side}`;
}
