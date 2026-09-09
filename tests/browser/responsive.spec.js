import { test, expect } from "@playwright/test";

for (const [name, width, height] of [
  ["small phone", 320, 568],
  ["phone", 390, 844],
  ["phone landscape", 844, 390],
  ["iPad mini", 768, 1024],
  ["iPad", 820, 1180],
  ["iPad landscape", 1180, 820],
]) {
  test(`${name}: home, full lobby, rules and themes fit`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height });
    const fits = async () => {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      for (const selector of [
        ".track",
        ".room-panel",
        ".action-panel",
        ".players",
        ".rules-modal",
      ]) {
        for (const item of await page.locator(selector).all()) {
          expect(
            await item.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
          ).toBe(true);
        }
      }
    };
    await page.goto("/");
    await fits();
    if (width <= 1024) {
      expect(
        await page
          .getByLabel("YOUR NAME")
          .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
      ).toBeGreaterThanOrEqual(16);
      for (const button of await page.locator("header button").all()) {
        expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
      }
    }
    await page.getByRole("button", { name: "How to play" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await fits();
    await page.getByRole("button", { name: "Close rules" }).click();
    await page.getByLabel("YOUR NAME").fill("LongUnbrokenPlayerName");
    await page.getByRole("button", { name: "Create private room" }).click();
    await expect(
      page.getByRole("button", { name: "Leave lobby" }),
    ).toBeVisible();
    const session = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("sh-session")),
    );
    for (let i = 1; i < 10; i++) {
      const res = await request.post("/api/game", {
        data: { type: "join", code: session.code, name: `LongPlayerName${i}` },
      });
      expect(res.ok()).toBe(true);
    }
    await expect(page.locator(".player")).toHaveCount(10);
    await fits();
    await page.getByRole("switch", { name: "Dark mode" }).click();
    await fits();
    await page.screenshot({
      path: `artifacts/responsive-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Leave lobby" }).click();
    await expect(
      page.getByRole("button", { name: "Create private room" }),
    ).toBeVisible();
  });
}
