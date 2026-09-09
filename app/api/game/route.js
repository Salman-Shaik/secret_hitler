import { randomInt } from "node:crypto";
import { act, create, player, view } from "../../../lib/game.js";
import { getRoom, saveRoom } from "../../../lib/store.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(req) {
  try {
    const code = new URL(req.url).searchParams.get("code");
    const g = await getRoom(code);
    if (!g) return reply({ error: "Room not found or expired." }, 404);
    const p = g.players.find(
      (p) => `Bearer ${p.token}` === req.headers.get("authorization"),
    );
    if (!p) return reply({ error: "Invalid session." }, 401);
    return reply(view(g, p.id));
  } catch (e) {
    return reply({ error: e.message }, 400);
  }
}
export async function POST(req) {
  try {
    if (
      req.headers.get("origin") &&
      req.headers.get("origin") !== new URL(req.url).origin
    )
      return reply({ error: "Invalid origin." }, 403);
    const a = await req.json();
    if (a.type === "create") {
      const p = player(a.name);
      for (let i = 0; i < 5; i++) {
        const code = Array.from(
          { length: 6 },
          () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[randomInt(24)],
        ).join("");
        const g = create(code, p);
        if (await saveRoom(g, null))
          return reply({ token: p.token, game: view(g, p.id) });
      }
      throw new Error("Try creating a room again.");
    }
    if (typeof a.code !== "string" || !/^[A-Z]{6}$/.test(a.code))
      throw new Error("Enter a six-letter room code.");
    for (let i = 0; i < 8; i++) {
      const g = await getRoom(a.code);
      if (!g) return reply({ error: "Room not found or expired." }, 404);
      const version = g.version;
      let p;
      if (a.type === "join") {
        if (g.phase !== "lobby" || g.players.length >= 10)
          throw new Error("This room has started or is full.");
        p = player(a.name);
        if (
          g.players.some((x) => x.name.toLowerCase() === p.name.toLowerCase())
        )
          throw new Error("That name is already at the table.");
        g.players.push(p);
      } else {
        p = g.players.find(
          (p) => `Bearer ${p.token}` === req.headers.get("authorization"),
        );
        if (!p) return reply({ error: "Invalid session." }, 401);
        if (a.version !== version)
          return reply(
            { error: "The table changed. Try your action again." },
            409,
          );
        act(g, p.id, a);
      }
      g.version++;
      if (await saveRoom(g, version))
        return a.type === "leave"
          ? reply({ left: true })
          : reply({ token: p.token, game: view(g, p.id) });
    }
    return reply({ error: "The table is busy. Try again." }, 409);
  } catch (e) {
    return reply({ error: e.message || "Unable to complete action." }, 400);
  }
}
