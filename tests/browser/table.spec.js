import { test, expect } from "@playwright/test";
test("desktop lobby, five-player API game, private roles, reconnect and mobile layout", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Good friends. Bad intentions." }),
  ).toBeVisible();
  await page.screenshot({ path: "artifacts/desktop.png", fullPage: true });
  await page.getByRole("button", { name: "How to play" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close rules" }).click();
  await page.getByLabel("YOUR NAME").fill("Ada");
  await page.getByRole("button", { name: "Create private room" }).click();
  await expect(
    page.getByRole("heading", { name: "A conspiracy needs company." }),
  ).toBeVisible();
  const session = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sh-session")),
  );
  const sessions = [session];
  for (const name of ["Bruno", "Clara", "Dieter", "Eva"]) {
    const res = await request.post("/api/game", {
      data: { type: "join", name, code: session.code },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    sessions.push({ code: session.code, token: data.token });
  }
  await expect(
    page.getByRole("button", { name: "Start game · 5/10 players" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Start game · 5/10 players" }).click();
  await expect(
    page.getByRole("heading", { name: "Open your secret envelope." }),
  ).toBeVisible();
  for (const s of sessions) {
    const headers = { Authorization: `Bearer ${s.token}` };
    const g = await (
      await request.get(`/api/game?code=${s.code}`, { headers })
    ).json();
    expect(g.players.every((p) => !p.token)).toBeTruthy();
    expect(g.deck).toBeUndefined();
    const res = await request.post("/api/game", {
      headers,
      data: { type: "ready", code: s.code, version: g.version },
    });
    expect(res.ok()).toBeTruthy();
  }
  await expect(
    page.getByRole("heading", { name: "A government begins with trust." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A government begins with trust." }),
  ).toBeVisible();
  await page.screenshot({ path: "artifacts/game.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
