import { describe, it, expect, vi, beforeEach } from "vitest";

// ── фейкова БД (підмножина supabase-js, яку використовує publisher) ──
const db: Record<string, any[]> = {};
function q(table: string) {
  let filters: ((r: any) => boolean)[] = [];
  let op: "select" | "update" | "insert" = "select";
  let patch: any; let single = false;
  const b: any = {
    select: () => b, order: () => b, limit: () => b,
    eq: (k: string, v: any) => { filters.push((r) => r[k] === v); return b; },
    in: (k: string, v: any[]) => { filters.push((r) => v.includes(r[k])); return b; },
    gte: () => b, lt: () => b, lte: () => b,
    update: (p: any) => { op = "update"; patch = p; return b; },
    insert: (p: any) => { op = "insert"; patch = p; return b; },
    upsert: (p: any) => { op = "insert"; patch = p; return b; },
    single: () => { single = true; return b; }, maybeSingle: () => { single = true; return b; },
    then: (res: any) => {
      const rows = (db[table] ??= []);
      if (op === "insert") { rows.push(...[].concat(patch)); return res({ data: null, error: null }); }
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") { hit.forEach((r) => Object.assign(r, patch)); return res({ data: null, error: null }); }
      const out = hit.map((r) => table === "publications" ? { ...r, post: db.posts.find((p) => p.id === r.post_id), account: db.accounts.find((a) => a.id === r.account_id) } : r);
      return res({ data: single ? out[0] ?? null : out, error: null });
    },
  };
  return b;
}
vi.mock("../src/lib/supabase/admin", () => ({ adminDb: () => ({ from: q }) }));
vi.mock("../src/lib/log", () => ({ log: async () => {} }));

// ── фейковий Threads ──
const containers = new Map<string, string>();
let seq = 0; let failAuth = false;
const fake = {
  createContainer: vi.fn(async () => { if (failAuth) { const { ThreadsApiError } = await import("../src/lib/threads/errors"); throw new ThreadsApiError("Invalid token", "auth", 400, 190); } const id = `c${++seq}`; containers.set(id, "IN_PROGRESS"); return { id }; }),
  containerStatus: vi.fn(async (id: string) => ({ id, status: containers.get(id) })),
  publish: vi.fn(async (id: string) => { containers.set(id, "PUBLISHED"); return { id: "media-" + id }; }),
  media: vi.fn(async (id: string) => ({ id, permalink: "https://threads.net/p/" + id })),
};
vi.mock("../src/lib/accounts", () => ({ clientForAccount: async () => fake }));

const { startPublication, advancePublication } = await import("../src/lib/publisher");
const finishAll = () => containers.forEach((v, k) => v === "IN_PROGRESS" && containers.set(k, "FINISHED"));

beforeEach(() => {
  failAuth = false; containers.clear();
  db.accounts = [{ id: "a1", username: "shop", status: "active", daily_limit: 50, min_interval_minutes: 0 }];
  db.posts = [
    { id: "p-text", text: "hello", media: [], link_attachment: null, topic_tag: null },
    { id: "p-car", text: "car", media: [{ url: "https://x/1.jpg", kind: "image" }, { url: "https://x/2.jpg", kind: "image" }], link_attachment: null, topic_tag: null },
  ];
  db.publications = [];
});
const pub = (id: string, post_id: string) => db.publications.push({ id, post_id, account_id: "a1", status: "queued", attempts: 0, container_id: null, child_containers: [] });

describe("покрокова публікація", () => {
  it("текст: start → waiting → published", async () => {
    pub("x1", "p-text");
    expect(await startPublication("x1")).toBe("started");
    expect(db.publications[0].status).toBe("publishing");
    expect(await advancePublication("x1")).toBe("waiting");
    finishAll();
    expect(await advancePublication("x1")).toBe("published");
    expect(db.publications[0].permalink).toContain("threads.net");
    expect(fake.publish).toHaveBeenCalledTimes(1);
  });

  it("карусель: діти → батьківський контейнер → published", async () => {
    pub("x2", "p-car");
    await startPublication("x2");
    expect(db.publications[0].child_containers).toHaveLength(2);
    expect(await advancePublication("x2")).toBe("waiting");     // діти ще обробляються
    finishAll();
    expect(await advancePublication("x2")).toBe("waiting");     // створено CAROUSEL
    expect(db.publications[0].container_id).toBeTruthy();
    finishAll();
    expect(await advancePublication("x2")).toBe("published");
  });

  it("не дублює: контейнер уже PUBLISHED після збою", async () => {
    pub("x3", "p-text");
    await startPublication("x3"); finishAll();
    containers.set(db.publications[0].container_id, "PUBLISHED");
    const before = fake.publish.mock.calls.length;
    expect(await advancePublication("x3")).toBe("published");
    expect(fake.publish.mock.calls.length).toBe(before);
  });

  it("помилка авторизації → акаунт auth_error, публікація paused", async () => {
    failAuth = true; pub("x4", "p-text");
    expect(await startPublication("x4")).toBe("auth_error");
    expect(db.accounts[0].status).toBe("auth_error");
    expect(db.publications[0].status).toBe("paused");
  });

  it("акаунт на паузі → публікація не стартує", async () => {
    db.accounts[0].status = "paused"; pub("x5", "p-text");
    expect(await startPublication("x5")).toBe("paused");
    expect(fake.createContainer).not.toHaveBeenCalledWith(expect.objectContaining({ text: "never" }));
  });
});
