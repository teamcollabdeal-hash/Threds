import { describe, it, expect } from "vitest";
import { nextRun } from "../src/lib/schedule";
import { zonedToUtc } from "../src/lib/tz";
import { distribute, normalizeRow } from "../src/lib/distribute";
import { decideRetry, quotaGate } from "../src/lib/retry";
import { validatePost, countUniqueLinks } from "../src/lib/validate";
import { encrypt, decrypt } from "../src/lib/crypto";
import { classify } from "../src/lib/threads/errors";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("tz", () => {
  it("Kyiv winter = UTC+2, summer = UTC+3", () => {
    expect(zonedToUtc(2026, 1, 10, 9, 0, "Europe/Kyiv").toISOString()).toBe("2026-01-10T07:00:00.000Z");
    expect(zonedToUtc(2026, 7, 10, 9, 0, "Europe/Kyiv").toISOString()).toBe("2026-07-10T06:00:00.000Z");
  });
});

describe("nextRun", () => {
  const base = { times: ["09:00", "18:00"], weekdays: [], timezone: "Europe/Kyiv", starts_at: "2026-01-01T00:00:00Z" };
  it("daily picks next slot same day", () => {
    const r = nextRun({ ...base, frequency: "daily" }, new Date("2026-01-10T08:00:00Z"));
    expect(r?.toISOString()).toBe("2026-01-10T16:00:00.000Z");
  });
  it("daily rolls to next day", () => {
    const r = nextRun({ ...base, frequency: "daily" }, new Date("2026-01-10T16:00:00Z"));
    expect(r?.toISOString()).toBe("2026-01-11T07:00:00.000Z");
  });
  it("weekly respects weekdays (Mon only)", () => {
    // 2026-01-10 is Saturday → next Monday 2026-01-12
    const r = nextRun({ ...base, frequency: "weekly", weekdays: [1], times: ["10:00"] }, new Date("2026-01-10T12:00:00Z"));
    expect(r?.toISOString()).toBe("2026-01-12T08:00:00.000Z");
  });
  it("interval and ends_at", () => {
    const rule = { ...base, frequency: "interval" as const, interval_minutes: 90, starts_at: "2026-01-10T00:00:00Z" };
    expect(nextRun(rule, new Date("2026-01-10T01:00:00Z"))?.toISOString()).toBe("2026-01-10T01:30:00.000Z");
    expect(nextRun({ ...rule, ends_at: "2026-01-10T01:00:00Z" }, new Date("2026-01-10T00:59:00Z"))).toBeNull();
  });
});

describe("distribute", () => {
  const rows = [0, 1, 2, 3].map((i) => normalizeRow({ text: `t${i}` }));
  const start = new Date("2026-02-01T10:00:00Z");
  it("round robin + spacing per account", () => {
    const { plan } = distribute(rows, ["a", "b"], new Map(), "round_robin", start, 30);
    expect(plan.map((p) => p.accountId)).toEqual(["a", "b", "a", "b"]);
    expect(plan[2].scheduledAt.toISOString()).toBe("2026-02-01T10:30:00.000Z");
  });
  it("row mode resolves usernames, reports unknown", () => {
    const r = [normalizeRow({ text: "x", accounts: "@Shop1; ghost" })];
    const { plan, errors } = distribute(r, [], new Map([["shop1", "id1"]]), "row", start, 10);
    expect(plan).toHaveLength(1);
    expect(errors[0]).toContain("ghost");
  });
  it("all mode", () => {
    expect(distribute(rows.slice(0, 2), ["a", "b", "c"], new Map(), "all", start, 10).plan).toHaveLength(6);
  });
});

describe("retry & quota", () => {
  it("auth pauses, content fails, transient backs off", () => {
    expect(decideRetry("auth", 1, 5).action).toBe("pause_account");
    expect(decideRetry("content", 1, 5).action).toBe("fail");
    const now = new Date("2026-01-01T00:00:00Z");
    const d = decideRetry("transient", 3, 5, now);
    expect(d.action === "retry" && d.at.getTime() - now.getTime()).toBe(4 * 60_000);
    expect(decideRetry("transient", 5, 5).action).toBe("fail");
  });
  it("quota gate", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const pubs = [new Date("2026-01-01T11:55:00Z")];
    expect(quotaGate({ publishedLast24h: pubs, dailyLimit: 10, minIntervalMinutes: 10, now }).ok).toBe(false);
    expect(quotaGate({ publishedLast24h: pubs, dailyLimit: 1, minIntervalMinutes: 0, now }).ok).toBe(false);
    expect(quotaGate({ publishedLast24h: pubs, dailyLimit: 10, minIntervalMinutes: 5, now }).ok).toBe(true);
  });
});

describe("validate", () => {
  it("limits", () => {
    expect(validatePost({ text: "x".repeat(501), media: [] })).toHaveLength(1);
    expect(countUniqueLinks("a https://a.com b https://A.com, https://b.com")).toBe(2);
    expect(validatePost({ text: "", media: [] })).toHaveLength(1);
    expect(validatePost({ text: "ok", media: [{ url: "http://x", kind: "image" }] })).toHaveLength(1);
  });
});

describe("crypto & errors", () => {
  it("roundtrip", () => {
    const c = encrypt("secret-token", KEY);
    expect(c).not.toContain("secret");
    expect(decrypt(c, KEY)).toBe("secret-token");
  });
  it("classify", () => {
    expect(classify(400, 190)).toBe("auth");
    expect(classify(429)).toBe("rate_limit");
    expect(classify(503)).toBe("transient");
    expect(classify(400, 100)).toBe("content");
  });
});
