// Restaurant and event branding (event-branding, S-18). Server code imports this index; React islands import the
// pure modules (rules.ts, messages.ts) directly.
export * from "./rules";
export { brandingMessages } from "./messages";
export { EventBrandingPatchBody, RestaurantBrandingPatchBody } from "./api";
export {
  deleteEventLogo,
  deleteRestaurantLogo,
  getEventBranding,
  getEventLogo,
  getLogoOfEvent,
  getRestaurantBranding,
  getRestaurantLogo,
  saveEventLogo,
  saveRestaurantLogo,
  setEventBrandName,
  updateRestaurantBranding,
  type LogoImage,
  type SaveLogoResult,
} from "./service";
export { logoOfEventResponse, logoResponse, uploadLogo } from "./image-response";
