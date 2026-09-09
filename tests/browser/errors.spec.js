import { test, expect } from "@playwright/test";

test("invalid room, duplicate name, full lobby and started lobby", async ({
  request,
  page,
}) => {
  await page.goto("/?room=ZZZZZZ");
  await page.getByLabel("YOUR NAME").fill("Guest");
  await page.getByRole("button", { name: "Take your seat" }).click();
  await expect(page.locator(".error[role=alert]")).toHaveText(
    "Room not found or expired.",
  );
  const r = await (
    await request.post("/api/game", { data: { type: "create", name: "Host" } })
  ).json();
  const code = r.game.code;
  const duplicate = await request.post("/api/game", {
    data: { type: "join", code, name: "host" },
  });
  expect(duplicate.status()).toBe(400);
  for (let i = 1; i < 10; i++)
    expect(
      (
        await request.post("/api/game", {
          data: { type: "join", code, name: `P${i}` },
        })
      ).ok(),
    ).toBe(true);
  expect(
    (
      await request.post("/api/game", {
        data: { type: "join", code, name: "Extra" },
      })
    ).status(),
  ).toBe(400);
  const headers = { Authorization: `Bearer ${r.token}` };
  const s = await (
    await request.get(`/api/game?code=${code}`, { headers })
  ).json();
  expect(
    (
      await request.post("/api/game", {
        headers,
        data: { type: "start", code, version: s.version },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.post("/api/game", {
        data: { type: "join", code, name: "Late" },
      })
    ).status(),
  ).toBe(400);
});
test("room authorization, malformed input and cross-origin actions are rejected", async ({
  request,
}) => {
  const r = await (
    await request.post("/api/game", { data: { type: "create", name: "Host" } })
  ).json();
  const code = r.game.code;
  expect((await request.get(`/api/game?code=${code}`)).status()).toBe(401);
  expect(
    (
      await request.post("/api/game", {
        data: { type: "leave", code, version: 0 },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/game", {
        headers: { Origin: "https://evil.example" },
        data: { type: "create", name: "X" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/game", {
        headers: { "Content-Type": "application/json" },
        data: "{",
      })
    ).status(),
  ).toBe(400);
  for (const name of ["", " ".repeat(5), "A".repeat(25)])
    expect(
      (
        await request.post("/api/game", { data: { type: "create", name } })
      ).status(),
    ).toBe(400);
});
test("network interruption shows reconnect status and recovers", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("YOUR NAME").fill("Host");
  await page.getByRole("button", { name: "Create private room" }).click();
  await expect(page.getByRole("button", { name: "Leave lobby" })).toBeVisible();
  await page.route("**/api/game?*", (route) => route.abort());
  await expect(page.locator(".error[role=alert]")).toContainText(
    "Connection interrupted",
  );
  await page.unroute("**/api/game?*");
  await expect(page.locator(".error[role=alert]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Leave lobby" })).toBeVisible();
});
test("expired session can be cleared and keyboard rules dialog traps focus", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "sh-session",
      JSON.stringify({ code: "ZZZZZZ", token: "bad" }),
    ),
  );
  await page.reload();
  await expect(page.locator(".error[role=alert]")).toBeVisible();
  await page.getByRole("button", { name: "Clear saved session" }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("sh-session")),
  ).toBeNull();
  await page.getByRole("button", { name: "How to play" }).click();
  await expect(page.getByRole("button", { name: "Close rules" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("link", { name: "Read the original rulebook" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close rules" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
