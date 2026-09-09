import { test, expect } from "vitest";
import { act, player, view, eligible, powers } from "../lib/game.js";
import { lobby, setup, nominate, vote, legislation } from "./helpers/game.js";
test("invalid executive power rejects corrupted state", () => {
  const g = setup();
  g.phase = "executive";
  g.power = "bogus";
  expect(() =>
    act(g, g.host, { type: "power", target: g.players[1].id }),
  ).toThrow("Unknown executive power.");
});

test.each([undefined, null, 1, "", "   ", "x".repeat(25)])(
  "rejects invalid player name %s",
  (name) => expect(() => player(name)).toThrow(/name/),
);
test("trims names and gives independent secrets", () => {
  const a = player(" Ada "),
    b = player("Ada");
  expect(a.name).toBe("Ada");
  expect(a.token).not.toBe(b.token);
});
test("lobby authorization and boundaries", () => {
  for (const n of [1, 4, 11]) {
    const g = lobby(n);
    expect(() => act(g, g.host, { type: "start" })).toThrow(/5/);
  }
  const g = lobby();
  expect(() => act(g, "missing", { type: "start" })).toThrow(
    "Player not found.",
  );
  expect(() => act(g, g.players[1].id, { type: "start" })).toThrow(/host/);
  expect(() => act(g, g.host, { type: "join" })).toThrow("Invalid action.");
  act(g, g.players[1].id, { type: "leave" });
  expect(g.host).toBe(g.players[0].id);
  act(g, g.host, { type: "start" });
  expect(() => act(g, g.host, { type: "start" })).toThrow();
  act(g, g.host, { type: "ready" });
  act(g, g.host, { type: "ready" });
  expect(g.ready).toHaveLength(1);
});
test("unknown actions, dead players, finished games and readiness reject actions", () => {
  const g = setup();
  expect(() => act(g, g.host, { type: "ready" })).toThrow();
  expect(() => act(g, g.host, { type: "bogus" })).toThrow("Unknown action.");
  g.players[0].alive = false;
  expect(() => act(g, g.host, { type: "vote", yes: true })).toThrow(
    "You cannot act now.",
  );
  g.players[0].alive = true;
  g.phase = "finished";
  expect(() => act(g, g.host, { type: "vote", yes: true })).toThrow();
});
test("nominations reject self, dead, missing, term-limited, wrong actor and phase", () => {
  const g = setup();
  for (const target of [g.host, "missing"])
    expect(() => act(g, g.host, { type: "nominate", target })).toThrow(
      /eligible/,
    );
  g.players[1].alive = false;
  expect(eligible(g, g.players[1])).toBe(false);
  expect(() =>
    act(g, g.host, { type: "nominate", target: g.players[1].id }),
  ).toThrow();
  expect(() =>
    act(g, g.players[2].id, { type: "nominate", target: g.players[3].id }),
  ).toThrow();
  nominate(g);
  expect(() =>
    act(g, g.host, { type: "nominate", target: g.players[3].id }),
  ).toThrow();
});
test("ballots reject wrong phase and non-booleans", () => {
  const g = setup();
  expect(() => act(g, g.host, { type: "vote", yes: true })).toThrow();
  nominate(g);
  for (const yes of [1, "yes", null])
    expect(() => act(g, g.host, { type: "vote", yes })).toThrow();
});
test("discard rejects every invalid index and wrong legislator", () => {
  const g = setup();
  nominate(g);
  vote(g);
  for (const index of [-1, 3, 1.1, "0", null])
    expect(() => act(g, g.president, { type: "discard", index })).toThrow(
      "Choose a policy.",
    );
  act(g, g.president, { type: "discard", index: 0 });
  expect(() => act(g, g.president, { type: "discard", index: 0 })).toThrow(
    "These policies are private.",
  );
});
test.each(["liberal", "fascist"])("policy victory: %s", (policy) => {
  const g = setup();
  g[policy] = policy === "liberal" ? 4 : 5;
  legislation(g, policy);
  expect(g.winner).toBe(policy);
  expect(view(g, g.host).players.every((p) => p.role)).toBe(true);
});
test.each([5, 6, 7, 8, 9, 10])(
  "every executive board slot for %i players",
  (n) => {
    for (let slot = 1; slot <= 5; slot++) {
      const g = setup(n);
      g.fascist = slot - 1;
      legislation(g, "fascist");
      expect(g.power || "").toBe(powers(n)[slot - 1]);
    }
  },
);
test("investigating a Liberal is private, dead/self/missing targets are rejected", () => {
  const g = setup();
  g.phase = "executive";
  g.power = "investigate";
  g.players[2].alive = false;
  for (const target of ["missing", g.host, g.players[2].id])
    expect(() => act(g, g.host, { type: "power", target })).toThrow();
  expect(() =>
    act(g, g.players[1].id, { type: "power", target: g.players[3].id }),
  ).toThrow();
  act(g, g.host, { type: "power", target: g.players[1].id });
  expect(g.players[0].notes[0]).toContain("Liberal party");
  expect(() => act(g, g.president, { type: "power" })).toThrow();
});
test("executing a non-Hitler conceals role and rotation skips dead seats", () => {
  const g = setup();
  g.phase = "executive";
  g.power = "execute";
  act(g, g.host, { type: "power", target: g.players[1].id });
  expect(g.president).toBe(g.players[2].id);
  expect(g.winner).toBeUndefined();
  expect(view(g, g.players[3].id).players[1].role).toBeUndefined();
});
test("veto constraints and chaos after third inactive government", () => {
  const g = setup();
  for (const phase of ["nominate", "chancellorDiscard"]) {
    g.phase = phase;
    expect(() => act(g, g.host, { type: "veto" })).toThrow();
  }
  g.phase = "chancellorDiscard";
  g.chancellor = g.players[1].id;
  g.fascist = 4;
  expect(() => act(g, g.chancellor, { type: "veto" })).toThrow();
  g.fascist = 5;
  g.hand = ["liberal", "fascist"];
  g.tracker = 2;
  g.deck = ["liberal", "fascist", "liberal"];
  act(g, g.chancellor, { type: "veto" });
  expect(() =>
    act(g, g.chancellor, { type: "vetoAnswer", yes: true }),
  ).toThrow();
  expect(() =>
    act(g, g.president, { type: "vetoAnswer", yes: "yes" }),
  ).toThrow();
  act(g, g.president, { type: "vetoAnswer", yes: true });
  expect(g.liberal).toBe(1);
  expect(g.tracker).toBe(0);
  expect(g.lastChancellor).toBe(null);
  expect(() =>
    act(g, g.president, { type: "vetoAnswer", yes: true }),
  ).toThrow();
});
test("reshuffle at end of legislation, lobby projection, and capped ledger", () => {
  const g = setup();
  g.deck = ["liberal", "liberal", "liberal", "fascist"];
  g.discard = ["fascist", "liberal"];
  legislation(g);
  expect(g.discard).toEqual([]);
  expect(g.deck).toHaveLength(5);
  const l = lobby();
  l.log = Array.from({ length: 70 }, (_, i) => ({ id: i, message: "event" }));
  expect(view(l, l.host).ready).toEqual([]);
  expect(view(l, l.host).log).toHaveLength(60);
});
