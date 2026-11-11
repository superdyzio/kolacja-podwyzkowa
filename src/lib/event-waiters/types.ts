// The per-event waiter of a request (event-waiter-access, S-21b): set by the middleware as `locals.waiter` in the
// waiter area only. Carries no token or hash. Its event is the ONLY event the waiter area may open.
export interface WaiterSession {
  waiterId: number;
  eventId: number;
  restaurantId: number;
  name: string;
  expiresAt: string;
}

// A new waiter session's secret (goes only into the Set-Cookie header), its end and its event.
export interface NewWaiterSession {
  token: string;
  expiresAt: string;
  eventId: number;
}
