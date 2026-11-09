import { defineMessages } from "@/lib/i18n/locale";
import { PRODUCT_NAME } from "@/lib/i18n/product";

// Texts of the restaurant panel page /panel/restauracje/<id> (platform-restaurants, S-10), both languages (i18n).
export const restaurantPanelMessages = defineMessages(
  {
    pageTitle: (name: string) => `${name} — ${PRODUCT_NAME}`,
    backToPanel: "← Wróć do panelu",
    yourRole: "Twoja rola",
    eventsHeading: "Wydarzenia",
    eventCount: (count: number) => `Wydarzeń: ${String(count)}`,
    eventsComingSoon: "Zakładanie wydarzeń, ich lista i linki dla klienta pojawią się tu wkrótce.",
    teamHeading: "Zespół",
    teamComingSoon: "Zapraszanie menedżerów i kelnerów pojawi się tu wkrótce.",
    accountPending: "czeka na ustawienie hasła",
  },
  {
    pageTitle: (name: string) => `${name} — ${PRODUCT_NAME}`,
    backToPanel: "← Back to the panel",
    yourRole: "Your role",
    eventsHeading: "Events",
    eventCount: (count: number) => `Events: ${String(count)}`,
    eventsComingSoon: "Creating events, their list and the client's links will appear here soon.",
    teamHeading: "Team",
    teamComingSoon: "Inviting managers and waiters will appear here soon.",
    accountPending: "has not set a password yet",
  },
);
