// The platform panel (platform-restaurants, S-10). Server only: the service issues one-time links (node:crypto).
// Islands import ./rules, ./messages and ./summary directly.
export { AddOwnerBody, CreateRestaurantBody, UpdateRestaurantBody } from "./api";
export { ownerInputProblem, platformMessages, restaurantNameProblem } from "./messages";
export {
  OWNER_NAME_MAX,
  RESTAURANT_NAME_MAX,
  parseOwnerInput,
  parseRestaurantName,
  type OwnerInputResult,
  type RestaurantNameResult,
} from "./rules";
export {
  PlatformError,
  addRestaurantOwner,
  createRestaurantWithOwner,
  issueOwnerLink,
  listPlatformRestaurants,
  setRestaurantDisabled,
  type AddOwnerResult,
  type CreateRestaurantResult,
  type OwnerInput,
  type OwnerLinkResult,
} from "./service";
export { formatRestaurantCounters } from "./summary";
