// Local load measurement for scale-150 (S-19, NFR-011, NFR-015): events filled to the limits (150 guests, 60 tables
// with four of 30 seats), then 200 phones and one TV per event poll like the islands do (every 2.5 s after the last
// answer, `since` tokens, 4 s abort). After a warm-up every event publishes a changed seating and the script measures
// how long each poller took to see it (NFR-011: ≤ 5 s), the per-request timings of the 204 and 200 paths and the answer
// sizes, and prints a Lambda estimate (one request per instance: instances ≈ requests per second × mean duration).
//
//   npm run load:local -- [--phones 200] [--events 1] [--seconds 25] [--keep]
//
// Needs a running server (`AI_PROVIDER=mock npm run preview`) on a LOCAL address (BASE_URL, default
// http://localhost:4321) with the LOCAL Supabase in .env; refuses anything else. It creates its own restaurants and
// events and deletes them at the end (`--keep` leaves them and prints their links: a full-size event for manual checks).
// Zero dependencies on purpose.

import { Buffer } from "node:buffer";
/* global AbortSignal -- Node 22 has it globally, like fetch */
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import { URL } from "node:url";
import { PlatformError, createEvent, createRestaurant, printEventLinks, readDbEnv } from "./lib/platform.mjs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const POLL_MS = 2500;
const ABORT_MS = 4000;
const WARM_UP_MS = 8000;

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < 1) {
    throw new PlatformError(`--${name} wymaga dodatniej liczby całkowitej.`);
  }
  return value;
}

const PHONES = option("phones", 200);
const EVENTS = option("events", 1);
const SECONDS = option("seconds", 25);
const KEEP = process.argv.includes("--keep");

async function call(path, { method = "GET", json } = {}) {
  const headers = { Origin: BASE_URL };
  if (json !== undefined) headers["Content-Type"] = "application/json";
  const started = performance.now();
  const response = await fetch(BASE_URL + path, {
    method,
    headers,
    body: json === undefined ? undefined : JSON.stringify(json),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  const ms = performance.now() - started;
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // not JSON
  }
  return { status: response.status, data, bytes: Buffer.byteLength(text), ms };
}

function expectStatus(result, status, what) {
  if (result.status !== status) {
    throw new PlatformError(`${what}: HTTP ${String(result.status)} (oczekiwano ${String(status)}).`);
  }
  return result;
}

// One full-size event: 150 guests, 3 rooms, 60 tables (4 × 30 rectangular + 56 × 4 round), everyone seated and
// published, guest links on. Returns its keys, the guests' keys and the seat list (for the changed draft later).
async function fillEvent(env, index, tag) {
  const restaurant = await createRestaurant(env, `Restauracja obciążenia ${tag}-${String(index + 1)}`);
  const event = await createEvent(env, restaurant.id, `Obciążenie 150 ${tag}-${String(index + 1)}`);
  const api = `/api/o/${event.organizerKey}`;
  const names = Array.from({ length: 150 }, (_, guest) => `Gość ${String(guest + 1)}`);
  const guests = expectStatus(
    await call(`${api}/guests`, { method: "POST", json: { text: names.join("\n") } }),
    201,
    "goście",
  );
  const rooms = [];
  for (const name of ["Sala A", "Sala B", "Sala C"]) {
    const added = expectStatus(await call(`${api}/rooms`, { method: "POST", json: { name } }), 201, "sala");
    rooms.push(added.data.rooms.find((room) => room.name === name).id);
  }
  for (let table = 0; table < 60; table++) {
    const long = table < 4;
    expectStatus(
      await call(`${api}/tables`, {
        method: "POST",
        json: {
          roomId: rooms[table % 3],
          name: `T${String(table + 1)}`,
          seatCount: long ? 30 : 4,
          shape: long ? "rectangular" : "round",
          x: Math.round((0.05 + (table % 10) * 0.1) * 1000) / 1000,
          y: Math.round((0.08 + Math.floor(table / 10) * 0.16) * 1000) / 1000,
        },
      }),
      201,
      "stolik",
    );
  }
  const venue = expectStatus(await call(`${api}/venue`), 200, "sala");
  const ids = guests.data.guests.map((guest) => guest.id);
  const places = [];
  for (const table of [...venue.data.tables].sort((a, b) => b.seatCount - a.seatCount)) {
    for (let seat = 1; seat <= table.seatCount && places.length < ids.length; seat++) {
      places.push({ tableId: table.id, seat });
    }
  }
  const seats = places.map((place, guest) => ({ guestId: ids[guest], ...place }));
  expectStatus(await call(`${api}/seating/draft`, { method: "POST", json: { seats } }), 200, "szkic");
  expectStatus(await call(`${api}/seating/publish`, { method: "POST" }), 201, "publikacja");
  const links = expectStatus(
    await call(`${api}/guest-links`, { method: "PATCH", json: { enabled: true } }),
    200,
    "linki",
  );
  return { restaurant, event, api, ids, places, guestKeys: links.data.guests.map((guest) => guest.key) };
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

const round = (value) => Math.round(value * 10) / 10;

async function main() {
  const base = new URL(BASE_URL);
  if (!["localhost", "127.0.0.1"].includes(base.hostname)) {
    throw new PlatformError(`Ten skrypt mierzy tylko lokalny serwer, a BASE_URL wskazuje ${base.host}.`);
  }
  const env = readDbEnv({ requireLocal: true });
  const tag = Math.random().toString(16).slice(2, 8);
  console.log(`Wypełniam ${String(EVENTS)} wydarzenie(a) do limitów (150 gości, 60 stolików, 4 × 30 miejsc)…`);
  const events = [];
  try {
    for (let index = 0; index < EVENTS; index++) {
      events.push(await fillEvent(env, index, tag));
    }

    // Every request of every poller: { kind, status, ms, bytes }.
    const samples = [];
    // Per event: the publish's answer time, and per poller the first moment it saw the new version.
    const publishedAt = new Map();
    const seenAt = [];
    let running = true;

    async function poller(kind, path, eventIndex) {
      let version = "";
      let baseline = null;
      const entry = { kind, eventIndex, at: null };
      seenAt.push(entry);
      await sleep(Math.random() * POLL_MS);
      while (running) {
        const started = performance.now();
        try {
          const response = await fetch(`${BASE_URL}${path}?since=${encodeURIComponent(version)}`, {
            signal: AbortSignal.timeout(ABORT_MS),
          });
          const text = await response.text();
          const ms = performance.now() - started;
          samples.push({ kind, status: response.status, ms, bytes: Buffer.byteLength(text) });
          if (response.status === 200) {
            version = JSON.parse(text).version;
            if (baseline === null) baseline = version;
            const published = publishedAt.get(eventIndex);
            if (published !== undefined && entry.at === null && version !== baseline) {
              entry.at = performance.now() - published;
            }
          }
        } catch {
          samples.push({ kind, status: "error", ms: performance.now() - started, bytes: 0 });
        }
        await sleep(POLL_MS);
      }
    }

    const pollers = [];
    for (const [eventIndex, event] of events.entries()) {
      pollers.push(poller("tv", `/api/tv/${event.event.tvKey}/seating`, eventIndex));
      for (let phone = 0; phone < PHONES; phone++) {
        pollers.push(poller("phone", `/api/g/${event.guestKeys[phone % event.guestKeys.length]}/state`, eventIndex));
      }
    }
    console.log(
      `Odpytuje ${String(pollers.length)} klientów co ${String(POLL_MS / 1000)} s; rozgrzewka ${String(WARM_UP_MS / 1000)} s…`,
    );
    await sleep(WARM_UP_MS);

    // A changed seating (every guest one seat further) for every event at once, then publish.
    const publishTimes = [];
    await Promise.all(
      events.map(async (event, eventIndex) => {
        const seats = event.places.map((place, index) => ({
          guestId: event.ids[(index + 1) % event.ids.length],
          ...place,
        }));
        expectStatus(
          await call(`${event.api}/seating/draft`, { method: "POST", json: { seats } }),
          200,
          "zmieniony szkic",
        );
        const publish = expectStatus(await call(`${event.api}/seating/publish`, { method: "POST" }), 201, "publikacja");
        publishTimes.push(publish.ms);
        publishedAt.set(eventIndex, performance.now());
      }),
    );
    await sleep(Math.max(0, SECONDS * 1000 - WARM_UP_MS));
    running = false;
    await Promise.all(pollers);

    const report = (kind, status) => {
      const rows = samples.filter((sample) => sample.kind === kind && sample.status === status);
      const times = rows.map((row) => row.ms);
      const bytes = rows.map((row) => row.bytes);
      return rows.length === 0
        ? `${kind} ${String(status)}: —`
        : `${kind} ${String(status)}: ${String(rows.length)} odpowiedzi, p50 ${String(round(percentile(times, 50)))} ms, p95 ${String(round(percentile(times, 95)))} ms, max ${String(round(Math.max(...times)))} ms, rozmiar max ${String(Math.max(...bytes))} B`;
    };
    const rate = samples.length / SECONDS;
    const meanMs = samples.reduce((sum, sample) => sum + sample.ms, 0) / Math.max(1, samples.length);
    const delays = seenAt.map((entry) => entry.at);
    const missing = delays.filter((delay) => delay === null).length;
    const seen = delays.filter((delay) => delay !== null);
    console.log("");
    console.log(
      `Wydarzenia: ${String(EVENTS)}, telefony na wydarzenie: ${String(PHONES)}, TV: ${String(EVENTS)}, czas: ${String(SECONDS)} s`,
    );
    console.log(
      `Publikacja (POST /seating/publish przy 150 gościach): ${publishTimes.map((ms) => `${String(round(ms))} ms`).join(", ")}`,
    );
    for (const [kind, status] of [
      ["phone", 204],
      ["phone", 200],
      ["tv", 204],
      ["tv", 200],
      ["phone", "error"],
      ["tv", "error"],
    ]) {
      console.log(`  ${report(kind, status)}`);
    }
    console.log(
      `Publikacja → klienci: ${String(seen.length)} z ${String(delays.length)} zobaczyło nowy rozkład; p50 ${String(round(percentile(seen, 50) / 1000))} s, p95 ${String(round(percentile(seen, 95) / 1000))} s, max ${String(round(Math.max(0, ...seen) / 1000))} s (cel ≤ 5 s)`,
    );
    console.log(
      `Ruch: ${String(round(rate))} żądań/s, średnio ${String(round(meanMs))} ms → szacunek Lambdy (prawo Little'a): ${String(round((rate * meanMs) / 1000))} instancji naraz`,
    );
    if (missing > 0 || Math.max(0, ...seen) > 5000) {
      process.exitCode = 1;
      console.log("UWAGA: nie każdy klient zobaczył publikację w 5 s.");
    }
  } finally {
    if (KEEP) {
      for (const event of events) {
        console.log(`\n${event.event.name} (zostaje):`);
        printEventLinks(BASE_URL, event.event);
        console.log(`  Gość:        ${new URL(`/g/${event.guestKeys[0]}`, BASE_URL).href}`);
      }
    } else {
      // Each DELETE must answer 2xx with exactly its one row (return=representation); anything else is reported with
      // the ids left in the local database (never thrown here: it would hide the measurement's own error).
      const headers = {
        apikey: env.serviceRoleKey,
        Authorization: `Bearer ${env.serviceRoleKey}`,
        Prefer: "return=representation",
      };
      const removeRow = async (table, id) => {
        try {
          const response = await fetch(`${env.url}/rest/v1/${table}?id=eq.${String(id)}`, {
            method: "DELETE",
            headers,
          });
          const rows = await response.json().catch(() => null);
          return response.ok && Array.isArray(rows) && rows.length === 1
            ? null
            : `${table} ${String(id)}: HTTP ${String(response.status)}${Array.isArray(rows) ? `, usunięto wierszy: ${String(rows.length)}` : ""}`;
        } catch (error) {
          return `${table} ${String(id)}: ${error instanceof Error ? error.message : String(error)}`;
        }
      };
      const leftBehind = [];
      for (const event of events) {
        // The event first: event.restaurant_id does not cascade, so its restaurant goes only after it.
        const eventProblem = await removeRow("event", event.event.id);
        if (eventProblem) {
          leftBehind.push(
            eventProblem,
            `restaurant ${String(event.restaurant.id)}: pominięta (zostało jej wydarzenie)`,
          );
          continue;
        }
        const restaurantProblem = await removeRow("restaurant", event.restaurant.id);
        if (restaurantProblem) {
          leftBehind.push(restaurantProblem);
        }
      }
      if (leftBehind.length === 0) {
        console.log(`\nUsunięto ${String(events.length)} wydarzenie(a) skryptu.`);
      } else {
        process.exitCode = 1;
        console.error(
          `\nNie udało się usunąć wszystkich danych skryptu z lokalnej bazy — zostały:\n- ${leftBehind.join("\n- ")}`,
        );
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof PlatformError ? error.message : error);
  process.exitCode = 1;
});
