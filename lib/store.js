const memory = (globalThis.__rooms ??= new Map());
const url = process.env.UPSTASH_REDIS_REST_URL,
  token = process.env.UPSTASH_REDIS_REST_TOKEN;
async function redis(...command) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Room storage is unavailable.");
  const data = await res.json();
  if (data.error) throw new Error("Room storage is unavailable.");
  return data.result;
}
function configured() {
  if (process.env.VERCEL && (!url || !token))
    throw new Error(
      "Configure Upstash Redis REST credentials before playing on Vercel.",
    );
  return url && token;
}
export async function getRoom(code) {
  if (configured()) {
    const raw = await redis("GET", `room:${code}`);
    return raw ? JSON.parse(raw) : null;
  }
  const item = memory.get(code);
  if (!item || item.expires < Date.now()) return null;
  return structuredClone(item.game);
}
export async function saveRoom(g, version) {
  const raw = JSON.stringify(g);
  if (configured()) {
    const script =
      version === null
        ? "if redis.call('EXISTS',KEYS[1])==1 then return 0 end redis.call('SET',KEYS[1],ARGV[1],'EX',86400) return 1"
        : "local old=redis.call('GET',KEYS[1]); if not old or cjson.decode(old).version~=tonumber(ARGV[2]) then return 0 end redis.call('SET',KEYS[1],ARGV[1],'EX',86400) return 1";
    return (
      (await redis("EVAL", script, 1, `room:${g.code}`, raw, version ?? 0)) ===
      1
    );
  }
  const old = memory.get(g.code);
  if (version === null ? !!old : old?.game.version !== version) return false;
  memory.set(g.code, {
    game: structuredClone(g),
    expires: Date.now() + 86400000,
  });
  return true;
}
