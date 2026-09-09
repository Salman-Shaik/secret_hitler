import { create, player, act, eligible } from "../../lib/game.js";
export function lobby(n = 7) {
  const g = create("ABCDEF", player("P0"));
  for (let i = 1; i < n; i++) g.players.push(player(`P${i}`));
  return g;
}
export function setup(n = 7) {
  const g = lobby(n);
  act(g, g.host, { type: "start" });
  for (const p of g.players) act(g, p.id, { type: "ready" });
  g.players.forEach(
    (p, i) =>
      (p.role =
        i === n - 1
          ? "hitler"
          : i >= n - 1 - Math.floor((n - 3) / 2)
            ? "fascist"
            : "liberal"),
  );
  g.president = g.host;
  return g;
}
export function nominate(g, target = g.players.find((p) => eligible(g, p)).id) {
  act(g, g.president, { type: "nominate", target });
}
export function vote(g, yes = true) {
  for (const p of g.players.filter((p) => p.alive))
    act(g, p.id, { type: "vote", yes });
}
export function legislation(g, policy = "liberal") {
  g.deck = [policy, policy, policy, ...g.deck.slice(3)];
  nominate(g);
  vote(g);
  act(g, g.president, { type: "discard", index: 0 });
  act(g, g.chancellor, { type: "discard", index: 0 });
}
