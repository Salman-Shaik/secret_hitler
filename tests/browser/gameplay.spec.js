import { test, expect } from "@playwright/test";
import { setup } from "../helpers/game.js";
import { randomInt } from "node:crypto";
const seedUrl = `http://127.0.0.1:${process.env.TEST_REDIS_PORT || 3199}/seed`;
async function seed(request, g) {
  g.code = Array.from({ length: 6 }, () =>
    String.fromCharCode(65 + randomInt(26)),
  ).join("");
  await request.post(seedUrl, {
    headers: { Authorization: "Bearer test-only" },
    data: g,
  });
  return g;
}
const headers = (p) => ({ Authorization: `Bearer ${p.token}` });
async function state(request, g, p = g.players[0]) {
  const r = await request.get(`/api/game?code=${g.code}`, {
    headers: headers(p),
  });
  expect(r.ok()).toBeTruthy();
  return r.json();
}
async function action(request, g, p, a) {
  const s = await state(request, g, p);
  const r = await request.post("/api/game", {
    headers: headers(p),
    data: { code: g.code, version: s.version, ...a },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return (await r.json()).game;
}
async function open(page, g, p = g.players[0]) {
  await page.goto("/");
  await page.evaluate(
    ({ code, token }) =>
      localStorage.setItem("sh-session", JSON.stringify({ code, token })),
    { code: g.code, token: p.token },
  );
  await page.reload();
  await expect(page.getByText("Trust is a dangerous game.")).toBeVisible();
}
async function elect(request, g, target) {
  let s = await state(request, g);
  const p = g.players.find((p) => p.id === s.president);
  s = await action(request, g, p, {
    type: "nominate",
    target: target || s.players.find((p) => p.eligible).id,
  });
  for (const voter of g.players.filter(
    (p) => s.players.find((x) => x.id === p.id).alive,
  ))
    s = await action(request, g, voter, { type: "vote", yes: true });
  return s;
}

for (const n of [5, 6, 7, 8, 9, 10])
  test(`complete ${n}-player game through real HTTP API`, async ({
    request,
    page,
  }) => {
    const created = await (
      await request.post("/api/game", { data: { type: "create", name: "P0" } })
    ).json();
    const g = {
      code: created.game.code,
      players: [{ id: created.game.me.id, token: created.token }],
    };
    for (let i = 1; i < n; i++) {
      const r = await (
        await request.post("/api/game", {
          data: { type: "join", code: g.code, name: `P${i}` },
        })
      ).json();
      g.players.push({ id: r.game.me.id, token: r.token });
    }
    await action(request, g, g.players[0], { type: "start" });
    for (const p of g.players) await action(request, g, p, { type: "ready" });
    await open(page, g);
    let s = await state(request, g),
      steps = 0;
    while (s.phase !== "finished" && steps++ < 160) {
      if (s.phase === "nominate") s = await elect(request, g);
      else if (
        s.phase === "presidentDiscard" ||
        s.phase === "chancellorDiscard"
      )
        s = await action(
          request,
          g,
          g.players.find(
            (p) =>
              p.id ===
              (s.phase === "presidentDiscard" ? s.president : s.chancellor),
          ),
          { type: "discard", index: 0 },
        );
      else if (s.phase === "executive") {
        const target = s.players.find(
          (p) =>
            p.alive &&
            p.id !== s.president &&
            (s.power !== "investigate" || !s.investigated.includes(p.id)),
        );
        s = await action(
          request,
          g,
          g.players.find((p) => p.id === s.president),
          { type: "power", target: target?.id },
        );
      } else throw Error(`Unexpected phase ${s.phase}`);
      for (const p of g.players) {
        const v = await state(request, g, p);
        expect(v.deck).toBeUndefined();
        expect(v.players.every((x) => !x.token)).toBe(true);
        expect(
          v.deckCount +
            v.discardCount +
            v.liberal +
            v.fascist +
            (v.phase === "presidentDiscard"
              ? 3
              : v.phase === "chancellorDiscard" || v.phase === "veto"
                ? 2
                : 0),
        ).toBe(17);
      }
    }
    expect(s.phase).toBe("finished");
    expect(s.players.every((p) => p.role)).toBe(true);
    await expect(
      page.getByRole("heading", {
        name: s.winner === "liberal" ? "Liberals win." : "Fascists win.",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Set up another game" }).click();
    await expect(
      page.getByRole("button", { name: "Create private room" }),
    ).toBeVisible();
  });

for (const winner of ["liberal", "fascist"])
  test(`policy victory ${winner} via browser legislation`, async ({
    request,
    page,
  }) => {
    const g = setup();
    g.phase = "chancellorDiscard";
    g.chancellor = g.players[1].id;
    g.hand = [winner, winner];
    g[winner] = winner === "liberal" ? 4 : 5;
    await seed(request, g);
    await open(page, g, g.players[1]);
    await page
      .getByRole("button", { name: `${winner} DISCARD THIS POLICY` })
      .first()
      .click();
    await expect(
      page.getByRole("heading", {
        name: winner === "liberal" ? "Liberals win." : "Fascists win.",
      }),
    ).toBeVisible();
  });
test("Hitler election victory and execution victory", async ({
  request,
  page,
}) => {
  const g = setup();
  g.fascist = 3;
  await seed(request, g);
  await open(page, g);
  await elect(request, g, g.players.at(-1).id);
  await expect(
    page.getByRole("heading", { name: "Fascists win." }),
  ).toBeVisible();
  const h = setup();
  h.phase = "executive";
  h.power = "execute";
  await seed(request, h);
  await page.evaluate(
    ({ code, token }) =>
      localStorage.setItem("sh-session", JSON.stringify({ code, token })),
    { code: h.code, token: h.players[0].token },
  );
  await page.reload();
  await page.getByRole("button", { name: "P6", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Liberals win." }),
  ).toBeVisible();
});
for (const power of ["peek", "investigate", "special", "execute"])
  test(`executive ${power}, privacy and resulting phase`, async ({
    request,
    page,
  }) => {
    const g = setup(9);
    g.phase = "executive";
    g.power = power;
    await seed(request, g);
    await open(page, g);
    await page
      .getByRole("button", {
        name: power === "peek" ? "Peek at top three policies" : "P1",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "A government begins with trust." }),
    ).toBeVisible();
    const own = await state(request, g),
      other = await state(request, g, g.players[1]);
    if (["peek", "investigate"].includes(power)) {
      expect(own.me.notes).toHaveLength(1);
      expect(other.me.notes).toEqual([]);
      await page.getByRole("button", { name: /FOR YOUR EYES ONLY/ }).click();
      await expect(page.locator(".private-note")).toBeVisible();
    }
    if (power === "execute") {
      expect(other.players[1].alive).toBe(false);
      expect(other.players[1].role).toBe("liberal");
      expect(own.players[1].role).toBeUndefined();
    }
    if (power === "special") {
      expect(own.president).toBe(g.players[1].id);
      await elect(request, g);
      let s = await state(request, g);
      s = await action(request, g, g.players[1], { type: "discard", index: 0 });
      await action(
        request,
        g,
        g.players.find((p) => p.id === s.chancellor),
        { type: "discard", index: 0 },
      );
    }
  });
for (const agree of [true, false])
  test(`veto ${agree ? "accepted" : "rejected"} via both leaders`, async ({
    request,
    page,
    browser,
  }) => {
    const g = setup();
    g.phase = "chancellorDiscard";
    g.chancellor = g.players[1].id;
    g.fascist = 5;
    g.hand = ["liberal", "fascist"];
    await seed(request, g);
    await open(page, g, g.players[1]);
    await page.getByRole("button", { name: "Request a veto" }).click();
    const context = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
    });
    try {
      const president = await context.newPage();
      await open(president, g);
      await president
        .getByRole("button", { name: agree ? "Agree to veto" : "Reject veto" })
        .click();
      if (agree) {
        await expect(
          page.getByRole("heading", {
            name: "A government begins with trust.",
          }),
        ).toBeVisible();
        expect((await state(request, g)).tracker).toBe(1);
      } else {
        await expect(
          page.getByRole("button", { name: "liberal DISCARD THIS POLICY" }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Request a veto" }),
        ).toHaveCount(0);
        await page
          .getByRole("button", { name: "fascist DISCARD THIS POLICY" })
          .click();
        await expect(
          page.getByRole("heading", {
            name: "A government begins with trust.",
          }),
        ).toBeVisible();
      }
    } finally {
      await context.close();
    }
  });
test("three rejected governments enact chaos and clear eligibility", async ({
  request,
  page,
}) => {
  const g = setup(6);
  g.deck[0] = "fascist";
  g.fascist = 2;
  await seed(request, g);
  await open(page, g);
  for (let round = 0; round < 3; round++) {
    let s = await state(request, g);
    s = await action(
      request,
      g,
      g.players.find((p) => p.id === s.president),
      { type: "nominate", target: s.players.find((p) => p.eligible).id },
    );
    for (const p of g.players)
      await action(request, g, p, { type: "vote", yes: false });
  }
  const s = await state(request, g);
  expect(s.fascist).toBe(3);
  expect(s.tracker).toBe(0);
  expect(s.power).toBe(null);
  expect(s.players.filter((p) => p.eligible)).toHaveLength(5);
  await expect(
    page.getByText("Fascist policy enacted by the people."),
  ).toBeVisible();
});
test("parallel ballots do not overwrite each other; stale requests are rejected", async ({
  request,
}) => {
  const g = setup();
  await seed(request, g);
  let s = await state(request, g);
  s = await action(request, g, g.players[0], {
    type: "nominate",
    target: g.players[1].id,
  });
  const responses = await Promise.all(
    g.players.map((p) =>
      request.post("/api/game", {
        headers: headers(p),
        data: { type: "vote", yes: true, code: g.code, version: s.version },
      }),
    ),
  );
  expect(responses.filter((r) => r.status() === 200)).toHaveLength(1);
  expect(responses.filter((r) => r.status() === 409)).toHaveLength(6);
  const after = await state(request, g);
  expect(after.voted).toHaveLength(1);
  expect(after.lastVotes).toBeNull();
  for (const p of g.players.filter((p) => !after.voted.includes(p.id)))
    await action(request, g, p, { type: "vote", yes: true });
  expect((await state(request, g)).phase).toBe("presidentDiscard");
});
