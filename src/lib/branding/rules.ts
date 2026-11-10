import type { StaffRole } from "@/lib/auth/types";
import { normalizeDisplayName } from "@/lib/guests/names";

// Rules of the restaurant's and the client's brand (event-branding, S-18, PRD v2 FR-032), shared by the API routes,
// the pages and the islands. Pure: no DB, no `astro:*`.
//
// Logos are user images: the server decides the type from the magic bytes (`sniffImageType` of the venue plan: PNG,
// JPEG, WebP — never SVG or anything a browser could run) and serves them only through the guarded routes of each
// area with `nosniff`. 512 KiB is far inside the 6 MB Lambda payload (base64 both ways) and plenty for a logo.

export const MAX_LOGO_BYTES = 512 * 1024;
export const BRAND_NAME_MAX = 80;

// Owner-only, like every restaurant setting (PRD Access Control: a manager never changes the restaurant's settings).
export const BRAND_EDIT_ROLES: readonly StaffRole[] = ["owner"];
// Who sees the restaurant's brand in the panel; a waiter gets the identical 404.
export const BRAND_VIEW_ROLES: readonly StaffRole[] = ["owner", "manager"];

// Which logo an image route serves: the event's own (the client's) or its restaurant's.
export const LOGO_KINDS = ["event", "restaurant"] as const;
export type LogoKind = (typeof LOGO_KINDS)[number];

export function isLogoKind(value: string | null | undefined): value is LogoKind {
  return value === "event" || value === "restaurant";
}

export type BrandColorResult = { ok: true; color: string | null } | { ok: false };

// "#1E3A8A", "#abc" (expanded), "" / null → no colour. Anything else (names, rgb(), url(…)) is refused, so the value
// can go into a style attribute as it is.
export function parseBrandColor(raw: string | null): BrandColorResult {
  if (raw === null) {
    return { ok: true, color: null };
  }
  const text = raw.trim().toLowerCase();
  if (text === "") {
    return { ok: true, color: null };
  }
  if (/^#[0-9a-f]{6}$/.test(text)) {
    return { ok: true, color: text };
  }
  if (/^#[0-9a-f]{3}$/.test(text)) {
    return { ok: true, color: `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}` };
  }
  return { ok: false };
}

function channel(hex: string, start: number): number {
  const value = parseInt(hex.slice(start, start + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

// WCAG relative luminance of a `#rrggbb` colour.
export function relativeLuminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

// Black or white text on the brand colour: whichever has the higher WCAG contrast ratio.
export function brandTextColor(hex: string): "#000000" | "#ffffff" {
  const luminance = relativeLuminance(hex);
  const onWhite = 1.05 / (luminance + 0.05);
  const onBlack = (luminance + 0.05) / 0.05;
  return onBlack >= onWhite ? "#000000" : "#ffffff";
}

export type BrandNameResult = { ok: true; name: string | null } | { ok: false };

// The client's company or event name: normalized like guest names, empty → none, at most 80 code points.
export function parseBrandName(raw: string | null): BrandNameResult {
  if (raw === null) {
    return { ok: true, name: null };
  }
  const name = normalizeDisplayName(raw);
  if (name === "") {
    return { ok: true, name: null };
  }
  return Array.from(name).length > BRAND_NAME_MAX ? { ok: false } : { ok: true, name };
}

// The image URL under an area's branding base (`/api/g/<key>/branding`, `/api/panel/restaurants/<id>/branding`, …);
// the version (epoch ms of the upload) changes the URL, the middleware forces no-store.
export function logoUrl(brandingBase: string, kind: LogoKind, version: number): string {
  return `${brandingBase}/logo?kind=${kind}&v=${String(version)}`;
}

// The restaurant panel's own logo route has no kind (the restaurant is in the path).
export function restaurantLogoUrl(brandingBase: string, version: number): string {
  return `${brandingBase}/logo?v=${String(version)}`;
}

// The inline style of a brand header: the colour and its readable text colour, or nothing (today's look).
export function brandStyle(color: string | null, textColor: string | null): string | undefined {
  return color && textColor ? `background-color: ${color}; color: ${textColor};` : undefined;
}
