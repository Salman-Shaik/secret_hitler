// Test-only Redis REST double. This server is never imported by the application.
// It models GET and atomic room CAS; live Redis/Lua compatibility is a separate integration concern.
import http from "node:http";
const rooms = new Map();
const port = Number(process.env.TEST_REDIS_PORT || 3199);
http
  .createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET") {
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    try {
      let body = "";
      for await (const chunk of req) body += chunk;
      if (req.headers.authorization !== "Bearer test-only") {
        res.writeHead(401);
        res.end("{}");
        return;
      }
      const data = JSON.parse(body);
      if (req.url === "/seed") {
        rooms.set(`room:${data.code}`, JSON.stringify(data));
        res.end("{}");
        return;
      }
      let result;
      if (data[0] === "GET") result = rooms.get(data[1]) || null;
      else if (data[0] === "EVAL") {
        const [, script, , key, raw, version] = data,
          old = rooms.get(key);
        const allowed = script.includes("'EXISTS'")
          ? !old
          : old && JSON.parse(old).version === Number(version);
        result = allowed ? 1 : 0;
        if (allowed) rooms.set(key, raw);
      } else throw Error("Unsupported Redis command");
      res.end(JSON.stringify({ result }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: e.message }));
    }
  })
  .listen(port, "127.0.0.1");
