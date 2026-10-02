import { test, expect, vi, beforeEach } from "vitest";
import { lobby, setup } from "./helpers/game.js";
const store = vi.hoisted(() => ({ getRoom: vi.fn(), saveRoom: vi.fn() }));
vi.mock("../lib/store.js", () => store);
import { GET, POST } from "../app/api/game/route.js";
let g;
beforeEach(() => {
  g = lobby(5);
  store.getRoom.mockReset().mockImplementation(async () => structuredClone(g));
  store.saveRoom.mockReset().mockResolvedValue(true);
});
function req(data, headers = {}) {
  return new Request("http://localhost/api/game", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data),
  });
}
const auth = () => ({ Authorization: `Bearer ${g.players[0].token}` });
test("same-election stale ballots retry safely; old elections and duplicate voters are rejected", async () => {
  g = setup(10);
  g.phase = "vote";
  g.chancellor = g.players[1].id;
  g.version = 8;
  const ballot = {
    type: "vote",
    yes: true,
    code: g.code,
    version: 0,
    election: `${g.round}:${g.president}:${g.chancellor}`,
  };
  expect(
    (await post({ ...ballot, election: "old-election" }, auth())).status,
  ).toBe(409);
  store.saveRoom.mockImplementation(async (next, version) => {
    if (g.version !== version) return false;
    g = structuredClone(next);
    return true;
  });
  const players = [...g.players];
  const results = await Promise.all(
    players.map((p) => post(ballot, { Authorization: `Bearer ${p.token}` })),
  );
  expect(results.map((r) => r.status)).toEqual(Array(10).fill(200));
  expect(Object.keys(g.lastVotes)).toHaveLength(10);
  expect(g.phase).toBe("presidentDiscard");
  expect((await post(ballot, auth())).status).toBe(409);
  g.phase = "vote";
  expect((await post({ ...ballot, version: g.version }, auth())).status).toBe(
    400,
  );
});
async function post(data, headers) {
  const res = await POST(req(data, headers));
  return { status: res.status, body: await res.json() };
}
test("GET returns a private uncached view", async () => {
  const r = await GET(
    new Request("http://localhost/api/game?code=ABCDEF", { headers: auth() }),
  );
  expect(r.status).toBe(200);
  expect(r.headers.get("Cache-Control")).toBe("no-store");
  expect((await r.json()).me.id).toBe(g.host);
});
test("GET missing room, invalid session, storage failure", async () => {
  expect(
    (await GET(new Request("http://localhost/api/game?code=X"))).status,
  ).toBe(401);
  store.getRoom.mockResolvedValueOnce(null);
  expect(
    (await GET(new Request("http://localhost/api/game?code=X"))).status,
  ).toBe(404);
  store.getRoom.mockRejectedValueOnce(new Error("offline"));
  const r = await GET(new Request("http://localhost/api/game"));
  expect(r.status).toBe(400);
  expect((await r.json()).error).toBe("offline");
});
test("create succeeds, retries collisions, and eventually stops", async () => {
  store.saveRoom.mockResolvedValueOnce(false);
  const r = await post(
    { type: "create", name: "Ada" },
    { origin: "http://localhost" },
  );
  expect(r.status).toBe(200);
  expect(r.body.game.code).toMatch(/^[A-Z]{6}$/);
  expect(r.body.token).toBeTruthy();
  store.saveRoom.mockResolvedValue(false);
  expect((await post({ type: "create", name: "Ada" })).body.error).toContain(
    "Try creating",
  );
});
test("origin, malformed JSON and body validation", async () => {
  expect((await post({}, { origin: "http://evil.test" })).status).toBe(403);
  expect(
    (
      await POST(
        new Request("http://localhost/api/game", { method: "POST", body: "{" }),
      )
    ).status,
  ).toBe(400);
  for (const code of [undefined, 3, "abc", "ABC12D"])
    expect((await post({ type: "join", code })).status).toBe(400);
});
test("join validates room, capacity, names and phase", async () => {
  store.getRoom.mockResolvedValueOnce(null);
  expect(
    (await post({ type: "join", code: "ABCDEF", name: "Ada" })).status,
  ).toBe(404);
  g.phase = "finished";
  expect(
    (await post({ type: "join", code: "ABCDEF", name: "Ada" })).status,
  ).toBe(400);
  g = lobby(10);
  expect(
    (await post({ type: "join", code: "ABCDEF", name: "Ada" })).status,
  ).toBe(400);
  g = lobby(5);
  expect(
    (await post({ type: "join", code: "ABCDEF", name: "p0" })).body.error,
  ).toContain("already");
  expect((await post({ type: "join", code: "ABCDEF", name: "" })).status).toBe(
    400,
  );
  const r = await post({ type: "join", code: "ABCDEF", name: "Ada" });
  expect(r.body.game.players).toHaveLength(6);
  expect(r.body.game.version).toBe(1);
});
test("actions require session and version; start and leave persist", async () => {
  const a = { type: "start", code: g.code, version: 0 };
  expect((await post(a)).status).toBe(401);
  expect((await post({ ...a, version: 99 }, auth())).status).toBe(409);
  expect((await post(a, auth())).body.game.phase).toBe("reveal");
  expect((await post({ ...a, type: "leave" }, auth())).body).toEqual({
    left: true,
  });
});
test("join and actions retry compare-and-set failures and stop after eight attempts", async () => {
  store.saveRoom.mockResolvedValueOnce(false);
  expect((await post({ type: "join", code: g.code, name: "Ada" })).status).toBe(
    200,
  );
  store.saveRoom.mockResolvedValue(false);
  expect(
    (await post({ type: "start", code: g.code, version: 0 }, auth())).status,
  ).toBe(409);
});
test("POST falls back for empty errors", async () => {
  store.getRoom.mockRejectedValueOnce(new Error());
  expect((await post({ type: "join", code: g.code })).body.error).toBe(
    "Unable to complete action.",
  );
});
