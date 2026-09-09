import { spawn } from "node:child_process";
import { mkdirSync, openSync, closeSync } from "node:fs";

export default async function globalSetup() {
  const port = process.env.TEST_PORT || "3105",
    redisPort = process.env.TEST_REDIS_PORT || "3199";
  const servers = [];
  mkdirSync("artifacts", { recursive: true });
  const log = openSync("artifacts/e2e-servers.log", "w");
  async function reachable(url) {
    try {
      return (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok;
    } catch {
      return false;
    }
  }
  async function stop() {
    for (const child of servers.reverse()) {
      if (child.exitCode !== null) continue;
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
      await exited;
      clearTimeout(timer);
    }
    closeSync(log);
  }
  async function start(args, url, env) {
    if (await reachable(url))
      throw Error(`Test port is already in use: ${url}`);
    const child = spawn(process.execPath, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", log, log],
      windowsHide: true,
    });
    servers.push(child);
    let failure;
    child.on("error", (e) => {
      failure = e;
    });
    for (let i = 0; i < 120; i++) {
      if (failure) throw failure;
      if (child.exitCode !== null)
        throw Error(
          `Test server exited (${child.exitCode}); see artifacts/e2e-servers.log`,
        );
      if (await reachable(url)) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw Error(`Server did not start: ${url}`);
  }
  try {
    await start(
      ["tests/helpers/redis-server.mjs"],
      `http://127.0.0.1:${redisPort}`,
      {},
    );
    await start(
      ["node_modules/next/dist/bin/next", "start", "-p", port],
      `http://localhost:${port}`,
      {
        NEXT_DIST_DIR: ".next-test",
        UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${redisPort}`,
        UPSTASH_REDIS_REST_TOKEN: "test-only",
      },
    );
    return stop;
  } catch (e) {
    await stop();
    throw e;
  }
}
