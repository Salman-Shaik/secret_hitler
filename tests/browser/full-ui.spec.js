import { test, expect } from "@playwright/test";

test("complete game with five independent browsers using game controls", async ({
  browser,
  request,
  baseURL,
}) => {
  test.setTimeout(300000);
  const contexts = [],
    pages = [],
    players = [];
  const created = await (
    await request.post("/api/game", { data: { type: "create", name: "P0" } })
  ).json();
  const code = created.game.code;
  players.push({ id: created.game.me.id, token: created.token });
  for (let i = 1; i < 5; i++) {
    const r = await (
      await request.post("/api/game", {
        data: { type: "join", code, name: `P${i}` },
      })
    ).json();
    players.push({ id: r.game.me.id, token: r.token });
  }
  const read = async (p = players[0]) =>
    (
      await request.get(`/api/game?code=${code}`, {
        headers: { Authorization: `Bearer ${p.token}` },
      })
    ).json();
  async function clickAs(id, name) {
    const page = pages[players.findIndex((p) => p.id === id)];
    await page.reload();
    const pending = page.waitForResponse(
      (r) => r.url().endsWith("/api/game") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name, exact: true }).first().click();
    const res = await pending;
    expect(res.ok(), await res.text()).toBe(true);
    return (await res.json()).game;
  }
  try {
    for (const p of players) {
      const context = await browser.newContext({ baseURL });
      contexts.push(context);
      const page = await context.newPage();
      pages.push(page);
      await page.addInitScript(
        (s) => localStorage.setItem("sh-session", JSON.stringify(s)),
        { code, token: p.token },
      );
      await page.goto("/");
      await expect(
        page.getByRole("button", { name: "Leave lobby" }),
      ).toBeVisible();
    }
    await clickAs(players[0].id, "Start game · 5/10 players");
    for (let i = 0; i < 5; i++) {
      await pages[i].reload();
      await pages[i]
        .getByRole("button", { name: /FOR YOUR EYES ONLY/ })
        .click();
      await expect(pages[i].locator(".secret-panel h3")).toBeVisible();
      players[i].role = (await read(players[i])).me.role;
      await clickAs(players[i].id, "I know my role");
    }
    let g = await read(),
      steps = 0;
    while (g.phase !== "finished" && steps++ < 100) {
      if (g.phase === "nominate") {
        const target = g.players.find(
          (p) =>
            p.eligible && players.find((x) => x.id === p.id).role !== "hitler",
        );
        g = await clickAs(g.president, target.name);
        for (const p of players.filter(
          (p) => g.players.find((x) => x.id === p.id).alive,
        ))
          g = await clickAs(p.id, "Ja! YES");
      } else if (
        g.phase === "presidentDiscard" ||
        g.phase === "chancellorDiscard"
      ) {
        const id = g.phase === "presidentDiscard" ? g.president : g.chancellor;
        const own = await read(players.find((p) => p.id === id));
        g = await clickAs(id, `${own.hand[0]} DISCARD THIS POLICY`);
      } else if (g.phase === "executive") {
        if (g.power === "peek")
          g = await clickAs(g.president, "Peek at top three policies");
        else {
          const target =
            g.players.find(
              (p) =>
                p.alive &&
                p.id !== g.president &&
                players.find((x) => x.id === p.id).role === "hitler",
            ) || g.players.find((p) => p.alive && p.id !== g.president);
          g = await clickAs(g.president, target.name);
        }
      } else throw Error(`Unexpected ${g.phase}`);
    }
    expect(g.phase).toBe("finished");
    for (const page of pages) {
      await expect(
        page.getByRole("heading", {
          name: g.winner === "liberal" ? "Liberals win." : "Fascists win.",
        }),
      ).toBeVisible();
      await expect(page.locator(".player em")).toHaveCount(5);
    }
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
