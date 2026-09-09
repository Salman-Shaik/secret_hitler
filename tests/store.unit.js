import { test, expect, vi, afterEach } from "vitest";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  delete globalThis.__rooms;
});
async function load(redis = false) {
  vi.resetModules();
  if (redis) {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "secret");
  } else {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  }
  return import("../lib/store.js");
}
test("memory missing, expired, cloned reads and version conflicts", async () => {
  delete globalThis.__rooms;
  const s = await load();
  expect(await s.getRoom("X")).toBeNull();
  const g = { code: "X", version: 0 };
  expect(await s.saveRoom(g, null)).toBe(true);
  expect(await s.saveRoom(g, null)).toBe(false);
  expect(await s.saveRoom({ code: "NO", version: 1 }, 0)).toBe(false);
  const copy = await s.getRoom("X");
  copy.version = 99;
  expect((await s.getRoom("X")).version).toBe(0);
  globalThis.__rooms.get("X").expires = 0;
  expect(await s.getRoom("X")).toBeNull();
  vi.resetModules();
  const again = await import("../lib/store.js");
  expect(await again.getRoom("X")).toBeNull();
});
test.each([
  ["", ""],
  ["https://redis.example", ""],
  ["", "token"],
])("Vercel refuses incomplete credentials %s/%s", async (url, token) => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", url);
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", token);
  vi.resetModules();
  const s = await import("../lib/store.js");
  await expect(s.getRoom("X")).rejects.toThrow(/Configure/);
});
test("Redis reads, creates and compare-and-set serialize commands and TTL", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ result: null }) })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: '{"code":"X","version":0}' }),
    })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ result: 1 }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ result: 0 }) });
  vi.stubGlobal("fetch", fetch);
  const s = await load(true);
  expect(await s.getRoom("X")).toBeNull();
  expect(await s.getRoom("X")).toEqual({ code: "X", version: 0 });
  expect(await s.saveRoom({ code: "X", version: 0 }, null)).toBe(true);
  expect(await s.saveRoom({ code: "X", version: 1 }, 0)).toBe(false);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(["GET", "room:X"]);
  for (const i of [2, 3]) {
    const args = JSON.parse(fetch.mock.calls[i][1].body);
    expect(args[0]).toBe("EVAL");
    expect(args[1]).toContain("86400");
    expect(args[3]).toBe("room:X");
    expect(fetch.mock.calls[i][1].headers.Authorization).toBe("Bearer secret");
  }
});
test.each([{ ok: false }, { ok: true, json: async () => ({ error: "down" }) }])(
  "Redis errors are surfaced without credentials",
  async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const s = await load(true);
    await expect(s.getRoom("X")).rejects.toThrow(
      "Room storage is unavailable.",
    );
  },
);
