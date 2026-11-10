import type { APIRoute } from "astro";
import * as aiTopics from "@/pages/api/o/[key]/ai-topics";
import * as drinks from "@/pages/api/o/[key]/drinks";
import * as drinksById from "@/pages/api/o/[key]/drinks/[id]";
import * as groups from "@/pages/api/o/[key]/groups";
import * as groupsById from "@/pages/api/o/[key]/groups/[id]";
import * as guesses from "@/pages/api/o/[key]/guesses";
import * as guessesById from "@/pages/api/o/[key]/guesses/[id]";
import * as guestLinks from "@/pages/api/o/[key]/guest-links";
import * as guestLinksByIdRevoke from "@/pages/api/o/[key]/guest-links/[id]/revoke";
import * as guests from "@/pages/api/o/[key]/guests";
import * as guestsById from "@/pages/api/o/[key]/guests/[id]";
import * as orders from "@/pages/api/o/[key]/orders";
import * as ordersById from "@/pages/api/o/[key]/orders/[id]";
import * as ordersByIdPieces from "@/pages/api/o/[key]/orders/[id]/pieces";
import * as plan from "@/pages/api/o/[key]/plan";
import * as planImage from "@/pages/api/o/[key]/plan/image";
import * as questions from "@/pages/api/o/[key]/questions";
import * as questionsById from "@/pages/api/o/[key]/questions/[id]";
import * as questionsDraw from "@/pages/api/o/[key]/questions/draw";
import * as questionsStarter from "@/pages/api/o/[key]/questions/starter";
import * as rooms from "@/pages/api/o/[key]/rooms";
import * as roomsById from "@/pages/api/o/[key]/rooms/[id]";
import * as seating from "@/pages/api/o/[key]/seating";
import * as seatingDraft from "@/pages/api/o/[key]/seating/draft";
import * as seatingGuestsById from "@/pages/api/o/[key]/seating/guests/[id]";
import * as seatingHistory from "@/pages/api/o/[key]/seating/history";
import * as seatingPublish from "@/pages/api/o/[key]/seating/publish";
import * as seatingPublished from "@/pages/api/o/[key]/seating/published";
import * as seatingRestore from "@/pages/api/o/[key]/seating/restore";
import * as tables from "@/pages/api/o/[key]/tables";
import * as tablesById from "@/pages/api/o/[key]/tables/[id]";
import * as tvSpotlight from "@/pages/api/o/[key]/tv-spotlight";
import * as tvSpotlightPerson from "@/pages/api/o/[key]/tv-spotlight/person";
import * as venue from "@/pages/api/o/[key]/venue";
import * as venueLayout from "@/pages/api/o/[key]/venue/layout";
import * as venueLayoutProposal from "@/pages/api/o/[key]/venue/layout-proposal";
import type { ClientRoutePattern } from "./match";

// The organizer route module of every sub-path the panel's dispatcher runs (client-restaurant-split, S-14). Not pure:
// the modules are the API routes themselves (src/pages/api/o/[key]/…), so the panel answers exactly like the client's
// link. Server only.

export type RouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ClientRouteModule = Partial<Record<RouteMethod, APIRoute>>;

export const CLIENT_ROUTE_MODULES: Readonly<Record<ClientRoutePattern, ClientRouteModule>> = {
  "ai-topics": aiTopics,
  drinks: drinks,
  "drinks/:id": drinksById,
  groups: groups,
  "groups/:id": groupsById,
  guesses: guesses,
  "guesses/:id": guessesById,
  "guest-links": guestLinks,
  "guest-links/:id/revoke": guestLinksByIdRevoke,
  guests: guests,
  "guests/:id": guestsById,
  orders: orders,
  "orders/:id": ordersById,
  "orders/:id/pieces": ordersByIdPieces,
  plan: plan,
  "plan/image": planImage,
  questions: questions,
  "questions/:id": questionsById,
  "questions/draw": questionsDraw,
  "questions/starter": questionsStarter,
  rooms: rooms,
  "rooms/:id": roomsById,
  seating: seating,
  "seating/draft": seatingDraft,
  "seating/guests/:id": seatingGuestsById,
  "seating/history": seatingHistory,
  "seating/publish": seatingPublish,
  "seating/published": seatingPublished,
  "seating/restore": seatingRestore,
  tables: tables,
  "tables/:id": tablesById,
  "tv-spotlight": tvSpotlight,
  "tv-spotlight/person": tvSpotlightPerson,
  venue: venue,
  "venue/layout": venueLayout,
  "venue/layout-proposal": venueLayoutProposal,
};

export function clientRouteHandler(pattern: ClientRoutePattern, method: string): APIRoute | null {
  const module = CLIENT_ROUTE_MODULES[pattern];
  const upper = method.toUpperCase();
  return upper === "GET" || upper === "POST" || upper === "PUT" || upper === "PATCH" || upper === "DELETE"
    ? (module[upper] ?? null)
    : null;
}
