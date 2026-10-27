import jsQR from "jsqr";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { QR_QUIET_ZONE, qrMatrix, qrSvgPath, qrViewBox } from "./qr";

// "A working personal QR code" (US-01 AC): the SVG path a card prints is rasterized back into pixels and decoded by
// an independent reader (jsQR), which must return exactly the guest's link.

const PIXELS_PER_MODULE = 4;
const RUN = /M(\d+) (\d+)h(\d+)v1h-(\d+)z/g;

function rasterize(path: string, side: number): Uint8ClampedArray {
  const width = side * PIXELS_PER_MODULE;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (const match of path.matchAll(RUN)) {
    const [x, y, run] = [Number(match[1]), Number(match[2]), Number(match[3])];
    for (let module = x; module < x + run; module++) {
      for (let dy = 0; dy < PIXELS_PER_MODULE; dy++) {
        for (let dx = 0; dx < PIXELS_PER_MODULE; dx++) {
          const offset = ((y * PIXELS_PER_MODULE + dy) * width + module * PIXELS_PER_MODULE + dx) * 4;
          pixels[offset] = 0;
          pixels[offset + 1] = 0;
          pixels[offset + 2] = 0;
        }
      }
    }
  }
  return pixels;
}

function decode(text: string): string | null {
  const matrix = qrMatrix(text);
  const side = matrix.size + 2 * QR_QUIET_ZONE;
  const width = side * PIXELS_PER_MODULE;
  return jsQR(rasterize(qrSvgPath(matrix), side), width, width, { inversionAttempts: "dontInvert" })?.data ?? null;
}

describe("guest link QR codes", () => {
  it.each([
    "https://kolacja.example.pl/g/AbCdEfGhIjKlMnOpQrStUv-_",
    "http://192.168.1.23:4321/g/z9Y8x7W6v5U4t3S2r1Q0p_-A",
    "https://kolacja-podwyzkowa.someone.workers.dev/g/__________--------______",
  ])("decodes back to the exact link %s", (url) => {
    expect(decode(url)).toBe(url);
  });

  it("keeps the library's orientation: x is the column, y the row", () => {
    // Readers also accept mirrored codes, so the decode test alone would not notice a transposed drawing.
    const url = "https://kolacja.example.pl/g/AbCdEfGhIjKlMnOpQrStUv-_";
    const matrix = qrMatrix(url);
    const { modules } = QRCode.create(url, { errorCorrectionLevel: "M" });
    for (let y = 0; y < matrix.size; y++) {
      for (let x = 0; x < matrix.size; x++) {
        expect(matrix.isDark(x, y)).toBe(modules.get(y, x) === 1);
      }
    }
  });

  it("draws only whole modules inside the quiet zone", () => {
    const matrix = qrMatrix("https://kolacja.example.pl/g/AbCdEfGhIjKlMnOpQrStUv-_");
    const path = qrSvgPath(matrix);
    expect(path).toMatch(/^(M\d+ \d+h\d+v1h-\d+z)+$/);
    for (const match of path.matchAll(RUN)) {
      const [x, y, run, back] = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
      expect(run).toBe(back);
      expect(x).toBeGreaterThanOrEqual(QR_QUIET_ZONE);
      expect(y).toBeGreaterThanOrEqual(QR_QUIET_ZONE);
      expect(x + run).toBeLessThanOrEqual(QR_QUIET_ZONE + matrix.size);
      expect(y).toBeLessThan(QR_QUIET_ZONE + matrix.size);
    }
  });

  it("puts the finder patterns in the top-left, top-right and bottom-left corners", () => {
    const matrix = qrMatrix("https://kolacja.example.pl/g/AbCdEfGhIjKlMnOpQrStUv-_");
    const last = matrix.size - 1;
    for (const [x, y] of [
      [0, 0],
      [last, 0],
      [0, last],
    ]) {
      expect(matrix.isDark(x, y)).toBe(true);
    }
    // The bottom-right corner has no finder pattern: its 7×7 block is not a solid frame.
    const frame = Array.from({ length: 7 }, (_, i) => matrix.isDark(last - i, last) && matrix.isDark(last, last - i));
    expect(frame.every(Boolean)).toBe(false);
  });

  it("sizes the view box as the symbol plus a quiet zone on every side", () => {
    const matrix = qrMatrix("https://kolacja.example.pl/g/AbCdEfGhIjKlMnOpQrStUv-_");
    const side = matrix.size + 2 * QR_QUIET_ZONE;
    expect(qrViewBox(matrix)).toBe(`0 0 ${side} ${side}`);
    // A ~50-character link fits a small symbol (version 3–4: 29–33 modules) that prints crisply at ~40 mm.
    expect(matrix.size).toBeGreaterThanOrEqual(25);
    expect(matrix.size).toBeLessThanOrEqual(41);
  });
});
