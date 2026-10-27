import { guestPath } from "@/lib/access/paths";

// Personal guest links (S-05). Links are built from the origin of the organizer's request, so they work wherever the
// app is hosted — and are useless for phones when that origin is the organizer's own machine.

export function guestUrl(origin: string, key: string): string {
  return new URL(guestPath(key), origin).href;
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

// True when the origin only works on this computer (cards printed from it would not open on a phone).
export function isLocalOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

export const LOCAL_ORIGIN_WARNING =
  "Ten adres działa tylko na tym komputerze — telefony gości go nie otworzą. Linki i karteczki przygotuj z publicznego adresu aplikacji.";
