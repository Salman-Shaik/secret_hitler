import { test } from "vitest";
import assert from "node:assert/strict";
import { act, create, player, view, eligible, powers } from "../lib/game.js";
import { getRoom, saveRoom } from "../lib/store.js";
test("leaving a lobby removes the player, transfers the host, and closes an empty room", () => {
  const host = player("Host"),
    guest = player("Guest");
  const g = create("LEAVEX", host);
  g.players.push(guest);
  act(g, host.id, { type: "leave" });
  assert.equal(g.host, guest.id);
  assert.equal(g.players.length, 1);
  assert.throws(() => view(g, host.id), /Invalid session/);
  act(g, guest.id, { type: "leave" });
  assert.equal(g.phase, "closed");
  assert.equal(g.host, null);
});
test("players cannot leave an active game", () => {
  const g = setup();
  assert.throws(
    () => act(g, g.host, { type: "leave" }),
    /before the game starts/,
  );
  assert.equal(g.players.length, 7);
});
function setup(n = 7) {
  const g = create("ABCDEF", player("P0"));
  for (let i = 1; i < n; i++) g.players.push(player(`P${i}`));
  act(g, g.host, { type: "start" });
  for (const p of g.players) act(g, p.id, { type: "ready" });
  return g;
}
function nominate(g) {
  const p = g.players.find((p) => eligible(g, p));
  act(g, g.president, { type: "nominate", target: p.id });
}
function vote(g, yes) {
  for (const p of g.players.filter((p) => p.alive))
    act(g, p.id, { type: "vote", yes });
}
test("all player counts get correct roles, deck, and private knowledge", () => {
  for (let n = 5; n <= 10; n++) {
    const g = setup(n);
    assert.equal(
      g.players.filter((p) => p.role === "fascist").length,
      Math.floor((n - 3) / 2),
    );
    assert.equal(g.deck.filter((x) => x === "liberal").length, 6);
    assert.equal(g.deck.length, 17);
    for (const p of g.players) {
      const v = view(g, p.id);
      assert.equal(JSON.stringify(v).includes(p.token), false);
      assert.equal(v.deck, undefined);
      assert.equal(
        v.players.filter((x) => x.role).length,
        p.role === "fascist" || (p.role === "hitler" && n <= 6)
          ? Math.floor((n - 3) / 2) + 1
          : 1,
      );
    }
  }
});
test("votes are sealed and duplicates rejected", () => {
  const g = setup();
  nominate(g);
  act(g, g.players[0].id, { type: "vote", yes: true });
  const v = view(g, g.players[1].id);
  assert.equal(v.votes, undefined);
  assert.equal(v.lastVotes, null);
  assert.throws(() => act(g, g.players[0].id, { type: "vote", yes: false }));
});
test("legislation keeps cards private and conserves all policies", () => {
  const g = setup();
  nominate(g);
  vote(g, true);
  assert.equal(view(g, g.president).hand.length, 3);
  assert.equal(view(g, g.chancellor).hand.length, 0);
  assert.throws(() => act(g, g.chancellor, { type: "discard", index: 0 }));
  act(g, g.president, { type: "discard", index: 0 });
  assert.equal(view(g, g.chancellor).hand.length, 2);
  act(g, g.chancellor, { type: "discard", index: 0 });
  assert.equal(g.liberal + g.fascist, 1);
  assert.equal(
    g.deck.length + g.discard.length + g.hand.length + g.liberal + g.fascist,
    17,
  );
});
test("three failed elections enact chaos and clear limits without a power", () => {
  const g = setup();
  g.fascist = 2;
  g.deck[0] = "fascist";
  g.lastPresident = g.players[0].id;
  g.lastChancellor = g.players[1].id;
  for (let i = 0; i < 3; i++) {
    nominate(g);
    vote(g, false);
  }
  assert.equal(g.fascist, 3);
  assert.equal(g.tracker, 0);
  assert.equal(g.lastPresident, null);
  assert.equal(g.lastChancellor, null);
  assert.equal(g.phase, "nominate");
});
test("a tied election fails and a passed election does not reset tracker", () => {
  const g = setup(6);
  nominate(g);
  for (let i = 0; i < 6; i++)
    act(g, g.players[i].id, { type: "vote", yes: i < 3 });
  assert.equal(g.tracker, 1);
  nominate(g);
  vote(g, true);
  assert.equal(g.tracker, 1);
});
test("five living players permit the previous President as Chancellor", () => {
  const g = setup();
  const p = g.players.find((p) => p.id !== g.president);
  g.lastPresident = p.id;
  assert.equal(eligible(g, p), false);
  g.players
    .filter((x) => x.id !== g.president && x.id !== p.id)
    .slice(0, 2)
    .forEach((x) => (x.alive = false));
  assert.equal(eligible(g, p), true);
  g.lastChancellor = p.id;
  assert.equal(eligible(g, p), false);
});
test("Hitler election victory is automatic", () => {
  const g = setup();
  const h = g.players.find((p) => p.role === "hitler");
  g.president = g.players.find((p) => p.id !== h.id).id;
  g.fascist = 3;
  act(g, g.president, { type: "nominate", target: h.id });
  vote(g, true);
  assert.equal(g.winner, "fascist");
  assert.equal(g.phase, "finished");
});
test("investigation reveals party only and cannot repeat", () => {
  const g = setup(9);
  const h = g.players.find((p) => p.role === "hitler");
  g.president = g.players.find((p) => p.role === "liberal").id;
  const president = g.president;
  g.phase = "executive";
  g.power = "investigate";
  act(g, president, { type: "power", target: h.id });
  assert.match(view(g, president).me.notes[0], /Fascist party/);
  assert.equal(view(g, h.id).me.notes.length, 0);
  g.president = president;
  g.phase = "executive";
  g.power = "investigate";
  assert.throws(() => act(g, president, { type: "power", target: h.id }));
});
test("special election resumes normal rotation even when next player was appointed", () => {
  const g = setup();
  g.president = g.players[0].id;
  g.phase = "executive";
  g.power = "special";
  act(g, g.president, { type: "power", target: g.players[1].id });
  nominate(g);
  vote(g, false);
  assert.equal(g.president, g.players[1].id);
  assert.equal(g.resume, null);
});
test("peek preserves deck and execution ends game only for Hitler", () => {
  const g = setup(5);
  g.phase = "executive";
  g.power = "peek";
  const id = g.president,
    deck = [...g.deck];
  act(g, id, { type: "power" });
  assert.deepEqual(g.deck, deck);
  assert.equal(view(g, id).me.notes.length, 1);
  g.president = g.players.find((p) => p.role === "liberal").id;
  g.phase = "executive";
  g.power = "execute";
  act(g, g.president, {
    type: "power",
    target: g.players.find((p) => p.role === "hitler").id,
  });
  assert.equal(g.winner, "liberal");
});
test("veto rejection forces enactment; consent advances tracker and keeps limits", () => {
  for (const yes of [false, true]) {
    const g = setup();
    g.fascist = 5;
    g.president = g.players.find((p) => p.role === "hitler").id;
    nominate(g);
    vote(g, true);
    act(g, g.president, { type: "discard", index: 0 });
    const chancellor = g.chancellor;
    act(g, chancellor, { type: "veto" });
    act(g, g.president, { type: "vetoAnswer", yes });
    if (yes) {
      assert.equal(g.tracker, 1);
      assert.equal(g.lastChancellor, chancellor);
      assert.equal(g.hand.length, 0);
    } else {
      assert.equal(g.phase, "chancellorDiscard");
      assert.throws(() => act(g, chancellor, { type: "veto" }));
    }
  }
});
test("random complete games conserve policies and always finish", () => {
  for (let run = 0; run < 50; run++) {
    const g = setup(5 + (run % 6));
    let steps = 0;
    while (g.phase !== "finished" && steps++ < 500) {
      if (g.phase === "nominate") nominate(g);
      else if (g.phase === "vote") vote(g, true);
      else if (g.phase === "presidentDiscard")
        act(g, g.president, { type: "discard", index: 0 });
      else if (g.phase === "chancellorDiscard")
        act(g, g.chancellor, { type: "discard", index: 0 });
      else if (g.phase === "executive") {
        const target = g.players.find(
          (p) =>
            p.alive &&
            p.id !== g.president &&
            (g.power !== "investigate" || !g.investigated.includes(p.id)),
        );
        act(g, g.president, { type: "power", target: target?.id });
      }
      assert.equal(
        g.deck.length +
          g.discard.length +
          g.hand.length +
          g.liberal +
          g.fascist,
        17,
      );
    }
    assert.equal(g.phase, "finished");
  }
});
test("store uses atomic versions and isolated copies", async () => {
  const g = create("STOREX", player("Host"));
  assert.equal(await saveRoom(g, null), true);
  assert.equal(await saveRoom(g, null), false);
  const a = await getRoom(g.code),
    b = await getRoom(g.code);
  a.version++;
  assert.equal(await saveRoom(a, 0), true);
  b.version++;
  assert.equal(await saveRoom(b, 0), false);
  assert.equal((await getRoom(g.code)).version, 1);
});
