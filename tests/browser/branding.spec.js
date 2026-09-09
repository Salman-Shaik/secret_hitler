import { test, expect } from "@playwright/test";

test("game name and favicon are served with original-game attribution", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Secret Hitler — A Game of Trust & Treason");
  await expect(
    page.getByRole("link", { name: "Secret Hitler home" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Adapted from Secret Hitler by/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "CC BY-NC-SA 4.0" }),
  ).toBeVisible();
  const icon = page.locator('link[rel="icon"]').first();
  await expect(icon).toHaveAttribute("href", /\/icon\.svg/);
  const res = await request.get(await icon.getAttribute("href"));
  expect(res.ok()).toBe(true);
  expect(res.headers()["content-type"]).toContain("image/svg+xml");
  expect(await res.text()).toContain('viewBox="0 0 64 64"');
});
