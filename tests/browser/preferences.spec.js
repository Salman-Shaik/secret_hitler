import { test, expect } from "@playwright/test";

test("theme follows the system, persists overrides, and can return to automatic", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const toggle = page.getByRole("switch", { name: "Dark mode" });
  await expect(toggle).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: "artifacts/dark-desktop.png", fullPage: true });
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.reload();
  await expect(toggle).not.toBeChecked();
  await page.getByRole("button", { name: "Use system theme" }).click();
  await expect(toggle).toBeChecked();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(toggle).not.toBeChecked();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(toggle).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/dark-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("host can leave, guest becomes host, and departing session is revoked", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByLabel("YOUR NAME").fill("Departing host");
  await page.getByRole("button", { name: "Create private room" }).click();
  await expect(page.getByRole("button", { name: "Leave lobby" })).toBeVisible();
  const session = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sh-session")),
  );
  const join = await request.post("/api/game", {
    data: { type: "join", code: session.code, name: "New host" },
  });
  const guest = await join.json();
  await expect(
    page.getByRole("button", { name: "Start game · 2/10 players" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Leave lobby" }).click();
  await expect(
    page.getByRole("button", { name: "Create private room" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Create private room" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("sh-session")),
  ).toBeNull();
  const old = await request.get(`/api/game?code=${session.code}`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  expect(old.status()).toBe(401);
  const remaining = await (
    await request.get(`/api/game?code=${session.code}`, {
      headers: { Authorization: `Bearer ${guest.token}` },
    })
  ).json();
  expect(remaining.players).toHaveLength(1);
  expect(remaining.host).toBe(remaining.me.id);
});
