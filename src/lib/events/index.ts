// A restaurant's events in the panel (restaurant-events, S-11). Server side; islands import the pure modules
// (./rules, ./dates, ./messages) directly.
export { CreateEventBody, UpdateEventBody } from "./api";
export {
  addDays,
  DAY_ROLLOVER_HOUR,
  eventTiming,
  formatEventDate,
  localDateTime,
  partitionEvents,
  PLATFORM_TIME_ZONE,
  platformToday,
} from "./dates";
export { eventInputProblemText, eventPanelMessages } from "./messages";
export {
  canDeleteEvents,
  canManageEvents,
  EVENT_DELETE_ROLES,
  EVENT_LINK_KINDS,
  EVENT_NAME_MAX,
  EVENT_STAFF_ROLES,
  EXPECTED_GUESTS_MAX,
  isEventLinkKind,
  parseEventDate,
  parseEventName,
  parseExpectedGuests,
  validateEventInput,
  type EventInputProblem,
  type EventLinkKind,
} from "./rules";
export {
  createRestaurantEvent,
  deleteEvent,
  getEventCard,
  listRestaurantEvents,
  rotateEventKey,
  updateEvent,
  type CreateRestaurantEventResult,
  type EventPatch,
} from "./service";
