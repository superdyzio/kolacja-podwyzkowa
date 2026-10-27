import { describe, expect, it } from "vitest";
import {
  MAX_PLAN_BYTES,
  base64ToBytes,
  bytesToBase64,
  formatMegabytes,
  isPlanImageType,
  sniffImageType,
} from "./image";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
const WEBP = new Uint8Array([...ascii("RIFF"), 0x24, 0x00, 0x00, 0x00, ...ascii("WEBPVP8 ")]);

describe("sniffImageType", () => {
  it("recognizes PNG, JPEG and WebP by their magic bytes", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(WEBP)).toBe("image/webp");
  });

  it.each([
    ["empty", new Uint8Array()],
    ["truncated PNG", PNG.subarray(0, 7)],
    ["truncated JPEG", JPEG.subarray(0, 2)],
    ["RIFF without WEBP (e.g. WAV)", new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE")])],
    ["truncated WebP", WEBP.subarray(0, 11)],
    ["GIF", ascii("GIF89a\x01\x00")],
    ["SVG", ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ["HTML", ascii("<!doctype html><script>alert(1)</script>")],
    ["PDF", ascii("%PDF-1.7")],
  ])("rejects %s", (_name, input) => {
    expect(sniffImageType(input)).toBeNull();
  });
});

describe("isPlanImageType", () => {
  it("accepts only the three plan types", () => {
    expect(isPlanImageType("image/png")).toBe(true);
    expect(isPlanImageType("image/webp")).toBe(true);
    expect(isPlanImageType("image/svg+xml")).toBe(false);
    expect(isPlanImageType("text/html")).toBe(false);
  });
});

describe("base64 codec", () => {
  it("round-trips every byte value, including 0x00, 0x5C and 0xFF", () => {
    const all = new Uint8Array(256).map((_, index) => index);
    expect(base64ToBytes(bytesToBase64(all))).toEqual(all);
    expect(bytesToBase64(bytes(0x00, 0x5c, 0xff))).toBe("AFz/");
  });

  it.each([0, 1, 2, 3, 4, 5])("pads %d bytes to 4 * ceil(n / 3) characters without line breaks", (length) => {
    const encoded = bytesToBase64(new Uint8Array(length).fill(0xab));
    expect(encoded.length).toBe(Math.ceil(length / 3) * 4);
    expect(encoded).not.toMatch(/\s/);
    expect(base64ToBytes(encoded)).toEqual(new Uint8Array(length).fill(0xab));
  });

  it("handles buffers larger than one chunk", () => {
    const large = new Uint8Array(200_003).map((_, index) => (index * 31) % 256);
    expect(base64ToBytes(bytesToBase64(large))).toEqual(large);
  });

  it("returns an ArrayBuffer-backed array usable as a Response body", async () => {
    const decoded = base64ToBytes("AFz/");
    expect(decoded.buffer).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(await new Response(decoded).arrayBuffer())).toEqual(bytes(0x00, 0x5c, 0xff));
  });
});

describe("formatMegabytes", () => {
  it("uses a Polish decimal comma", () => {
    expect(formatMegabytes(MAX_PLAN_BYTES)).toBe("5 MB");
    expect(formatMegabytes(4.25 * 1024 * 1024)).toBe("4,3 MB");
  });
});
