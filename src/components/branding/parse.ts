import type { BrandingDto, LogoDto, RestaurantBrandingDto } from "@/types";

// Shape checks of the branding answers (event-branding, S-18), for the islands: a body that is not ours is a failure.

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLogo(value: unknown): value is LogoDto | null {
  return value === null || (isObject(value) && typeof value.mimeType === "string" && typeof value.version === "number");
}

function isColor(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function parseRestaurantBranding(data: unknown): RestaurantBrandingDto | null {
  if (
    isObject(data) &&
    typeof data.restaurantId === "number" &&
    typeof data.name === "string" &&
    isColor(data.color) &&
    isColor(data.textColor) &&
    isLogo(data.logo)
  ) {
    return data as unknown as RestaurantBrandingDto;
  }
  return null;
}

export function parseBranding(data: unknown): BrandingDto | null {
  if (!isObject(data) || !isObject(data.restaurant) || !isObject(data.client)) {
    return null;
  }
  const { restaurant, client } = data;
  if (
    typeof restaurant.name === "string" &&
    isColor(restaurant.color) &&
    isLogo(restaurant.logo) &&
    (client.name === null || typeof client.name === "string") &&
    isLogo(client.logo)
  ) {
    return data as unknown as BrandingDto;
  }
  return null;
}
