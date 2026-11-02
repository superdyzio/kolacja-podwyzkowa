// Maps URL paths to the role whose key they carry. Every page and API route under these prefixes is guarded
// by the middleware; later slices add routes below them (e.g. /o/<key>/goscie, /api/o/<key>/guests, /g/<key>).
// restaurant-orders: /r/<key> is the restaurant's read-only view of the food order.

export type AccessRole = "organizer" | "tv" | "guest" | "restaurant";

export interface AccessPath {
  role: AccessRole;
  key: string;
  isApi: boolean;
}

const ROLE_BY_PREFIX: Record<string, AccessRole> = {
  o: "organizer",
  tv: "tv",
  g: "guest",
  r: "restaurant",
};

const ACCESS_PATH_PATTERN = /^\/(api\/)?(o|tv|g|r)\/([^/]+)(?:\/.*)?$/;

export function parseAccessPath(pathname: string): AccessPath | null {
  const match = ACCESS_PATH_PATTERN.exec(pathname);
  if (!match) {
    return null;
  }
  const [, , prefix, key] = match;
  const role = ROLE_BY_PREFIX[prefix];
  return { role, key, isApi: pathname.startsWith("/api/") };
}

export function organizerPath(key: string): string {
  return `/o/${key}`;
}

export function tvPath(key: string): string {
  return `/tv/${key}`;
}

export function guestPath(key: string): string {
  return `/g/${key}`;
}

export function restaurantPath(key: string): string {
  return `/r/${key}`;
}
