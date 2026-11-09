// Creates an event — and a new restaurant for it, unless --restaurant-id names an existing one — with the starter
// question base, then prints its organizer, TV and restaurant links. The way to start an event until the restaurant
// panel (S-11) exists. Works against whatever database .env points at (like `npm run links`): it prints the host
// first. The links are secret: do not paste the output anywhere public.
//
// Usage: npm run event:create -- [--restaurant "<name>" | --restaurant-id <id>] [--name "<event name>"]
//        BASE_URL=https://twoja-domena npm run event:create -- --restaurant "Pod Lipą" --name "Kolacja firmowa"
// (package.json runs it with --experimental-strip-types: the starter questions come from src/lib/questions/seed.ts.)

import { parseArgs } from "node:util";
import { starterQuestionRows } from "../src/lib/questions/seed.ts";
import {
  createEvent,
  createRestaurant,
  insertStarterQuestions,
  PlatformError,
  printEventLinks,
  readDbEnv,
} from "./lib/platform.mjs";

const DEFAULT_RESTAURANT = "Restauracja";
const DEFAULT_EVENT = "Wydarzenie";
const baseUrl = process.env.BASE_URL ?? "http://localhost:4321";

function fail(message) {
  console.error(message);
  process.exit(1);
}

let options;
try {
  ({ values: options } = parseArgs({
    options: {
      restaurant: { type: "string" },
      "restaurant-id": { type: "string" },
      name: { type: "string" },
    },
    strict: true,
  }));
} catch (error) {
  fail(
    `${error instanceof Error ? error.message : String(error)}\nUżycie: npm run event:create -- [--restaurant "<nazwa>" | --restaurant-id <id>] [--name "<nazwa wydarzenia>"]`,
  );
}

if (options.restaurant !== undefined && options["restaurant-id"] !== undefined) {
  fail("Podaj --restaurant (nowa restauracja) albo --restaurant-id (istniejąca), nie oba.");
}
const restaurantId = options["restaurant-id"] === undefined ? null : Number(options["restaurant-id"]);
if (restaurantId !== null && (!Number.isInteger(restaurantId) || restaurantId < 1)) {
  fail("--restaurant-id musi być dodatnią liczbą całkowitą.");
}
const restaurantName = (options.restaurant ?? DEFAULT_RESTAURANT).trim();
const eventName = (options.name ?? DEFAULT_EVENT).trim();
if (restaurantId === null && (restaurantName.length === 0 || restaurantName.length > 80)) {
  fail("Nazwa restauracji: od 1 do 80 znaków.");
}
if (eventName.length === 0 || eventName.length > 120) {
  fail("Nazwa wydarzenia: od 1 do 120 znaków.");
}

try {
  const env = readDbEnv();
  console.log(`Baza: ${env.host}`);
  const restaurant =
    restaurantId === null ? await createRestaurant(env, restaurantName) : { id: restaurantId, name: null };
  const event = await createEvent(env, restaurant.id, eventName);
  const added = await insertStarterQuestions(env, event.id, starterQuestionRows());
  console.log(
    restaurant.name === null
      ? `Wydarzenie „${event.name}” (id ${String(event.id)}) w restauracji id ${String(restaurant.id)}`
      : `Restauracja „${restaurant.name}” (id ${String(restaurant.id)}), wydarzenie „${event.name}” (id ${String(event.id)})`,
  );
  console.log(`Baza startowa pytań: ${String(added)}`);
  printEventLinks(baseUrl, event);
} catch (error) {
  fail(error instanceof PlatformError ? error.message : String(error));
}
