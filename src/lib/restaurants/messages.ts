import { defineMessages } from "@/lib/i18n/locale";
import { PRODUCT_NAME } from "@/lib/i18n/product";

// Texts of the restaurant panel page /panel/restauracje/<id> (platform-restaurants, S-10), both languages (i18n). The
// events section's texts are in src/lib/events/messages.ts (restaurant-events, S-11), the team's in
// src/lib/team/messages.ts (restaurant-team, S-12).
export const restaurantPanelMessages = defineMessages(
  {
    pageTitle: (name: string) => `${name} — ${PRODUCT_NAME}`,
    backToPanel: "← Wróć do panelu",
    yourRole: "Twoja rola",
  },
  {
    pageTitle: (name: string) => `${name} — ${PRODUCT_NAME}`,
    backToPanel: "← Back to the panel",
    yourRole: "Your role",
  },
);
