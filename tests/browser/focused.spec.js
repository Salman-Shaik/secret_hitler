import { test, expect } from "@playwright/test";
import { setup } from "../helpers/game.js";
import { randomInt } from "node:crypto";

test("five mobile ballot popups submit together without losing votes", async ({
  browser,
  request,
  baseURL,
}) => {
  const g = setup(5);
  g.code = Array.from({ length: 6 }, () =>
    String.fromCharCode(65 + randomInt(26)),
  ).join("");
  g.phase = "vote";
  g.chancellor = g.players[1].id;
  await request.post(
    `http://127.0.0.1:${process.env.TEST_REDIS_PORT || 3199}/seed`,
    { headers: { Authorization: "Bearer test-only" }, data: g },
  );
  const contexts = [],
    pages = [];
  try {
    for (const p of g.players) {
      const context = await browser.newContext({
        baseURL,
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      });
      contexts.push(context);
      const page = await context.newPage();
      pages.push(page);
      await page.addInitScript(
        (s) => localStorage.setItem("sh-session", JSON.stringify(s)),
        { code: g.code, token: p.token },
      );
      await page.goto("/");
      await expect(
        page.getByRole("dialog", { name: "Cast your vote" }),
      ).toBeVisible();
    }
    await pages[0].screenshot({ path: "artifacts/focused-voting.png" });
    await Promise.all(
      pages.map((page) =>
        page.getByRole("button", { name: "Ja! YES", exact: true }).click(),
      ),
    );
    await Promise.all(
      pages.map(async (page) => {
        const posted = page.waitForResponse(
          (r) =>
            r.url().endsWith("/api/game") && r.request().method() === "POST",
        );
        await page.getByRole("button", { name: "Confirm selection" }).click();
        expect((await posted).status()).toBe(200);
        await expect(page.getByRole("dialog")).toHaveCount(0);
      }),
    );
    const state = await (
      await request.get(`/api/game?code=${g.code}`, {
        headers: { Authorization: `Bearer ${g.players[0].token}` },
      })
    ).json();
    expect(Object.keys(state.lastVotes)).toHaveLength(5);
    expect(state.phase).toBe("presidentDiscard");
    await expect(pages[0].locator(".action-panel")).toHaveClass(
      /action-required/,
    );
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
