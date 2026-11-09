import { defineMessages } from "@/lib/i18n/locale";
import { PRODUCT_NAME } from "@/lib/i18n/product";

// Texts of the restaurant panel page /panel/restauracje/<id> (platform-restaurants, S-10), both languages (i18n). The
// events section's texts are in src/lib/events/messages.ts (restaurant-events, S-11).
export const restaurantPanelMessages = defineMessages(
  {
    pageTitle: (name: string) => `${name} — ${PRODUCT_NAME}`,
    backToPanel: "← Wróć do panelu",
    yourRole: "Twoja rola",
    teamHeading: "Zespół",
    teamComingSoon: "Zapraszanie menedżerów i kelnerów pojawi się tu wkrótce.",
    accountPending: "czeka na ustawienie hasła",
  },
  {
    pageTitle: (name: string) => `${name} — ${PRODUCT_NAME}`,
    backToPanel: "← Back to the panel",
    yourRole: "Your role",
    teamHeading: "Team",
    teamComingSoon: "Inviting managers and waiters will appear here soon.",
    accountPending: "has not set a password yet",
  },
);
