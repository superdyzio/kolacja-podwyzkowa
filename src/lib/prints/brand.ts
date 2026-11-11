import { logoUrl } from "@/lib/branding/rules";
import type { BrandingDto, PrintBrandDto } from "@/types";

// The brand of a print (room-prints, S-24; event-branding S-18, white-label), pure: the restaurant's name, colour and
// logo and the client's name and logo. `logoBase` is the area's branding base the logos are loaded from — relative on
// the client's prints (`.` → /o/<key>/wydruki/logo, so the page carries no key), the dispatcher's on the panel — or
// null where a page loads no image (support mode: every image would be a logged read; the floors have no logo route).
export function printBrand(branding: BrandingDto | null, logoBase: string | null): PrintBrandDto | null {
  if (!branding) {
    return null;
  }
  const { restaurant, client } = branding;
  return {
    restaurantName: restaurant.name,
    clientName: client.name,
    color: restaurant.color,
    textColor: restaurant.textColor,
    restaurantLogo:
      logoBase !== null && restaurant.logo ? logoUrl(logoBase, "restaurant", restaurant.logo.version) : null,
    clientLogo: logoBase !== null && client.logo ? logoUrl(logoBase, "event", client.logo.version) : null,
  };
}
