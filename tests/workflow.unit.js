import { readFileSync } from "node:fs";
import { test, expect } from "vitest";
import { parse } from "yaml";

const workflow = parse(readFileSync(".github/workflows/tests.yml", "utf8"));
test("production deployment is gated by successful tests and trusted main events", () => {
  expect(workflow.on).toHaveProperty("push");
  expect(workflow.on).toHaveProperty("pull_request");
  expect(workflow.on).toHaveProperty("workflow_dispatch");
  expect(workflow.on).not.toHaveProperty("pull_request_target");
  expect(workflow.jobs.deploy.needs).toBe("test");
  expect(workflow.jobs.deploy.if).toContain("github.ref == 'refs/heads/main'");
  expect(workflow.jobs.deploy.if).toContain(
    "github.event_name != 'pull_request'",
  );
  expect(workflow.permissions).toEqual({ contents: "read" });
  expect(workflow.jobs.test.env).toBeUndefined();
  expect(
    JSON.parse(readFileSync("vercel.json", "utf8")).git.deploymentEnabled,
  ).toBe(false);
  const steps = workflow.jobs.test.steps
    .map((step) => step.run)
    .filter(Boolean);
  expect(steps).toContain("npm run test:coverage");
  expect(steps).toContain("npm run test:e2e");
});
test("deployment uses production artifacts, a fixed CLI version and masked environment credentials", () => {
  const job = workflow.jobs.deploy;
  expect(job.env).toEqual({
    VERCEL_TOKEN: "${{ secrets.VERCEL_TOKEN }}",
    VERCEL_ORG_ID: "${{ secrets.VERCEL_ORG_ID }}",
    VERCEL_PROJECT_ID: "${{ secrets.VERCEL_PROJECT_ID }}",
  });
  expect(job.steps[0].run).toContain('exit "$missing"');
  const commands = job.steps
    .map((s) => s.run)
    .filter(Boolean)
    .join("\n");
  expect(commands).toMatch(/vercel@\d+\.\d+\.\d+/);
  expect(commands).toContain("vercel pull --yes --environment=production");
  expect(commands).toContain("vercel build --prod");
  expect(commands).toContain("vercel deploy --prebuilt --prod");
  expect(commands).not.toContain('echo "$VERCEL_TOKEN"');
  expect(job.environment.name).toBe("production");
});
