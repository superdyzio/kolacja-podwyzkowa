import { describe, expect, it } from "vitest";
import type { PurgeResultDto, PurgeStatus } from "@/types";
import {
  describeRetentionDryRun,
  describeRetentionJob,
  MIN_RETENTION_TOKEN_LENGTH,
  RETENTION_DRY_RUN_LIMIT,
  RETENTION_JOB_NAME,
  RetentionJobBody,
  retentionTokenMatches,
  runRetentionBatches,
  runRetentionDryRun,
  usableRetentionToken,
} from "./job";

// retention-schedule (the PR #4 review's decision 3): the daily clean-up's token rules and its batch loop, with fake
// list/purge steps and a fake clock (never the database, never a real clock).

const TOKEN = "f".repeat(64);

function purged(eventId: number, status: PurgeStatus = "purged", guests = 2): PurgeResultDto {
  return {
    eventId,
    status,
    purgedAt: status === "purged" ? "2026-11-10T03:15:00Z" : null,
    guests: status === "purged" ? guests : 0,
    groups: status === "purged" ? 1 : 0,
    snapshots: status === "purged" ? 3 : 0,
    spotlight: 0,
    waiters: status === "purged" ? 1 : 0,
    notes: 0,
  };
}

describe("the clean-up's token", () => {
  it("is usable only when long enough and made of base64 / hex characters", () => {
    expect(MIN_RETENTION_TOKEN_LENGTH).toBe(32);
    expect(usableRetentionToken(TOKEN)).toBe(TOKEN);
    expect(usableRetentionToken("Ab0+/=_-".repeat(4))).toBe("Ab0+/=_-".repeat(4));
    for (const bad of [
      undefined,
      null,
      "",
      "x".repeat(31),
      `${"x".repeat(32)} `,
      `"${"x".repeat(32)}"`,
      "ą".repeat(40),
    ]) {
      expect(usableRetentionToken(bad), String(bad)).toBeNull();
    }
  });

  it("matches only the same token, whatever the length of a wrong one, and never without a configured one", () => {
    expect(retentionTokenMatches(TOKEN, TOKEN)).toBe(true);
    for (const wrong of ["", "f", "f".repeat(63), "f".repeat(65), `${"f".repeat(63)}e`, "x".repeat(10_000)]) {
      expect(retentionTokenMatches(TOKEN, wrong)).toBe(false);
    }
    expect(retentionTokenMatches(null, TOKEN)).toBe(false);
    expect(retentionTokenMatches(null, "")).toBe(false);
  });

  it("takes exactly the schedule's input: { job, token } and nothing else", () => {
    expect(RetentionJobBody.safeParse({ job: RETENTION_JOB_NAME, token: TOKEN }).success).toBe(true);
    for (const bad of [
      {},
      { token: TOKEN },
      { job: "other", token: TOKEN },
      { job: RETENTION_JOB_NAME, token: "" },
      { job: RETENTION_JOB_NAME, token: 42 },
      { job: RETENTION_JOB_NAME, token: TOKEN, extra: 1 },
      { job: RETENTION_JOB_NAME, token: "x".repeat(513) },
    ]) {
      expect(RetentionJobBody.safeParse(bad).success, JSON.stringify(bad).slice(0, 60)).toBe(false);
    }
  });

  it("takes the deploy's self-check { job, token, dryRun: true }, and nothing else with dryRun", () => {
    expect(RetentionJobBody.parse({ job: RETENTION_JOB_NAME, token: TOKEN, dryRun: true })).toEqual({
      job: RETENTION_JOB_NAME,
      token: TOKEN,
      dryRun: true,
    });
    // The schedule's own input is a real run: no dryRun at all.
    expect(RetentionJobBody.parse({ job: RETENTION_JOB_NAME, token: TOKEN }).dryRun).toBeUndefined();
    // dryRun: false is not a way to ask for a real run, and no other value is a dry run: the identical 404.
    for (const dryRun of [false, "true", 1, null, {}]) {
      expect(
        RetentionJobBody.safeParse({ job: RETENTION_JOB_NAME, token: TOKEN, dryRun }).success,
        JSON.stringify(dryRun),
      ).toBe(false);
    }
    expect(RetentionJobBody.safeParse({ job: RETENTION_JOB_NAME, token: TOKEN, dryRun: true, extra: 1 }).success).toBe(
      false,
    );
    expect(RetentionJobBody.safeParse({ job: "other", token: TOKEN, dryRun: true }).success).toBe(false);
    expect(RetentionJobBody.safeParse({ job: RETENTION_JOB_NAME, dryRun: true }).success).toBe(false);
  });
});

describe("the clean-up's self-check (dryRun)", () => {
  it("only lists — one read of at most limit + 1 ids, never a purge — and answers counts only", async () => {
    const limits: number[] = [];
    const result = await runRetentionDryRun({
      list: (limit) => {
        limits.push(limit);
        return Promise.resolve([4, 5, 6]);
      },
    });
    expect(limits).toEqual([RETENTION_DRY_RUN_LIMIT + 1]);
    expect(result).toEqual({ dryRun: true, events: 3, complete: true });
    expect(Object.keys(result).sort()).toEqual(["complete", "dryRun", "events"]);
    expect(describeRetentionDryRun(result)).toBe(
      "Retencja danych gości (sprawdzenie bez usuwania, dryRun): po terminie wydarzenia 3, nic nie usunięto",
    );
  });

  it("is exact up to the limit and says „or more” above it", async () => {
    const ids = (count: number) => Array.from({ length: count }, (_, index) => index + 1);
    expect(await runRetentionDryRun({ list: () => Promise.resolve([]) }, 2)).toEqual({
      dryRun: true,
      events: 0,
      complete: true,
    });
    expect(await runRetentionDryRun({ list: (limit) => Promise.resolve(ids(2).slice(0, limit)) }, 2)).toEqual({
      dryRun: true,
      events: 2,
      complete: true,
    });
    const over = await runRetentionDryRun({ list: (limit) => Promise.resolve(ids(9).slice(0, limit)) }, 2);
    expect(over).toEqual({ dryRun: true, events: 2, complete: false });
    expect(describeRetentionDryRun(over)).toBe(
      "Retencja danych gości (sprawdzenie bez usuwania, dryRun): po terminie wydarzenia 2 lub więcej, nic nie usunięto",
    );
  });
});

describe("the clean-up's batches", () => {
  it("purges batch after batch until nothing is left, and sums the counts", async () => {
    const pending = [1, 2, 3, 4, 5];
    const limits: number[] = [];
    const result = await runRetentionBatches(
      {
        list: (limit) => {
          limits.push(limit);
          return Promise.resolve(pending.slice(0, limit));
        },
        purge: (id) => {
          pending.splice(pending.indexOf(id), 1);
          return Promise.resolve(purged(id));
        },
      },
      { batch: 2, budgetMs: 1000, elapsedMs: () => 0 },
    );
    expect(result).toEqual({
      events: 5,
      guests: 10,
      groups: 5,
      snapshots: 15,
      spotlight: 0,
      waiters: 5,
      notes: 0,
      skipped: 0,
      complete: true,
    });
    expect(limits).toEqual([2, 2, 2, 2]);
  });

  it("counts what had nothing to purge after all and never purges an id twice in a run", async () => {
    const calls: number[] = [];
    const result = await runRetentionBatches(
      {
        // 7 stays listed (its purge says "clean"), 8 goes away once purged.
        list: () => Promise.resolve(calls.includes(8) ? [7] : [7, 8]),
        purge: (id) => {
          calls.push(id);
          return Promise.resolve(purged(id, id === 7 ? "clean" : "purged"));
        },
      },
      { batch: 25, budgetMs: 1000, elapsedMs: () => 0 },
    );
    expect(calls).toEqual([7, 8]);
    expect(result).toMatchObject({ events: 1, guests: 2, skipped: 1, complete: true });
  });

  it("stops at the time budget, also inside a batch, and says it is not complete", async () => {
    let now = 0;
    const purgedIds: number[] = [];
    const result = await runRetentionBatches(
      {
        list: (limit) => Promise.resolve([10, 11, 12, 13].filter((id) => !purgedIds.includes(id)).slice(0, limit)),
        purge: (id) => {
          purgedIds.push(id);
          now += 400;
          return Promise.resolve(purged(id));
        },
      },
      { batch: 25, budgetMs: 1000, elapsedMs: () => now },
    );
    expect(purgedIds).toEqual([10, 11, 12]);
    expect(result).toMatchObject({ events: 3, complete: false });
    // Nothing at all once the budget is gone before the first list.
    const none = await runRetentionBatches(
      { list: () => Promise.reject(new Error("never")), purge: () => Promise.reject(new Error("never")) },
      { batch: 25, budgetMs: 0, elapsedMs: () => 0 },
    );
    expect(none).toMatchObject({ events: 0, complete: false });
  });

  it("is complete at once when nothing is past its term, and logs counts only", async () => {
    const result = await runRetentionBatches(
      { list: () => Promise.resolve([]), purge: () => Promise.reject(new Error("never")) },
      { batch: 25, budgetMs: 1000, elapsedMs: () => 0 },
    );
    expect(result.complete).toBe(true);
    expect(describeRetentionJob(result)).toBe(
      "Retencja danych gości (codzienne sprzątanie): wydarzenia 0, goście 0, grupy 0, rozsadzenia 0, ekran TV 0, kelnerzy 0, uwagi zamówień 0, pominięte 0, wszystko",
    );
  });
});
