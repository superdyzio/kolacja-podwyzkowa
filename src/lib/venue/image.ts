import type { PlanImageType } from "@/types";

// What the server accepts as the venue plan (PRD FR-005) and how the bytes are stored. Pure functions only (no
// dependency, no `astro:*`); they run in Node and browsers.
//
// The type is decided by the file's magic bytes, never by the client's Content-Type or file name, and the image
// routes serve exactly that type (with `nosniff`), so an HTML or SVG file can never be served from our origin.
// The image is stored as padded base64 without line breaks (see the venue migration).

// 4 MiB: on AWS Lambda a Function URL carries a binary body base64-encoded inside the 6 MB (6 291 456 B) invocation
// payload, both for the upload and for the image answer; 4 MiB is 5 592 408 base64 characters, leaving room for the
// headers. The database allows up to 5 MiB (venue migration), so the app limit is the stricter one.
export const MAX_PLAN_BYTES = 4 * 1024 * 1024;

export const PLAN_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const satisfies readonly PlanImageType[];

export const PLAN_TOO_LARGE_MESSAGE = "Plik jest za duży — najwyżej 4 MB.";
export const PLAN_UNSUPPORTED_MESSAGE = "Wgraj obraz PNG, JPEG albo WebP.";
export const PLAN_EMPTY_MESSAGE = "Wybierz plik z planem.";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP = [0x57, 0x45, 0x42, 0x50]; // "WEBP"

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) {
    return false;
  }
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

export function sniffImageType(bytes: Uint8Array): PlanImageType | null {
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return "image/png";
  }
  if (startsWith(bytes, JPEG_SIGNATURE)) {
    return "image/jpeg";
  }
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) {
    return "image/webp";
  }
  return null;
}

export function isPlanImageType(value: string): value is PlanImageType {
  return (PLAN_IMAGE_TYPES as readonly string[]).includes(value);
}

// Chunked so String.fromCharCode never gets millions of arguments.
const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK));
  }
  return btoa(binary);
}

// Returns an ArrayBuffer-backed copy (usable directly as a Response body).
export function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

// "4,2 MB" (Polish decimal comma), for messages.
export function formatMegabytes(byteCount: number): string {
  const megabytes = byteCount / (1024 * 1024);
  return `${megabytes.toLocaleString("pl-PL", { maximumFractionDigits: 1 })} MB`;
}
