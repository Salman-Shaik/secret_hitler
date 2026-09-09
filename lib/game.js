import { randomInt, randomUUID } from "node:crypto";
export const powers = (n) =>
  n <= 6
    ? ["", "", "peek", "execute", "execute", ""]
    : n <= 8
      ? ["", "investigate", "special", "execute", "execute", ""]
      : ["investigate", "investigate", "special", "execute", "execute", ""];
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const requireThat = (ok, message) => {
  if (!ok) throw new Error(message);
};
const alive = (g) => g.players.filter((p) => p.alive);
const log = (g, message) => g.log.unshift({ id: randomUUID(), message });
export function player(name) {
  requireThat(
    typeof name === "string" &&
      name.trim().length > 0 &&
      name.trim().length <= 24,
    "Use a name between 1 and 24 characters.",
  );
  return {
    id: randomUUID(),
    token: randomUUID(),
    name: name.trim(),
    alive: true,
    notes: [],
  };
}
export function create(code, p) {
  return {
    code,
    version: 0,
    host: p.id,
    players: [p],
    phase: "lobby",
    liberal: 0,
    fascist: 0,
    tracker: 0,
    round: 1,
    log: [],
    votes: {},
    lastVotes: null,
    investigated: [],
    deck: [],
    discard: [],
    hand: [],
    president: null,
    chancellor: null,
    lastPresident: null,
    lastChancellor: null,
    resume: null,
  };
}
function refill(g) {
  if (g.deck.length < 3) {
    g.deck = shuffle([...g.deck, ...g.discard]);
    g.discard = [];
  }
}
function next(g) {
  const start = g.resume ?? g.president;
  g.resume = null;
  let i = g.players.findIndex((p) => p.id === start);
  do {
    i = (i + 1) % g.players.length;
  } while (!g.players[i].alive);
  g.president = g.players[i].id;
  g.chancellor = null;
  g.phase = "nominate";
  g.round++;
  g.votes = {};
  g.vetoDenied = false;
  g.power = null;
}
function win(g, team, reason) {
  g.phase = "finished";
  g.winner = team;
  g.reason = reason;
  log(g, reason);
}
function enact(g, policy, chaos = false) {
  g[policy]++;
  g.tracker = 0;
  log(
    g,
    `${policy === "liberal" ? "Liberal" : "Fascist"} policy enacted${chaos ? " by the people" : ""}.`,
  );
  refill(g);
  if (g.liberal === 5)
    return win(g, "liberal", "Five Liberal policies have been enacted.");
  if (g.fascist === 6)
    return win(g, "fascist", "Six Fascist policies have been enacted.");
  g.power =
    !chaos && policy === "fascist"
      ? powers(g.players.length)[g.fascist - 1]
      : null;
  if (g.power) g.phase = "executive";
  else next(g);
}
function failed(g) {
  g.tracker++;
  if (g.tracker === 3) {
    g.lastPresident = null;
    g.lastChancellor = null;
    refill(g);
    enact(g, g.deck.shift(), true);
  } else {
    refill(g);
    next(g);
  }
}
export function eligible(g, p) {
  return (
    p.alive &&
    p.id !== g.president &&
    p.id !== g.lastChancellor &&
    (alive(g).length <= 5 || p.id !== g.lastPresident)
  );
}
export function act(g, id, a) {
  const me = g.players.find((p) => p.id === id);
  requireThat(me, "Player not found.");
  if (a.type === "leave") {
    requireThat(
      g.phase === "lobby",
      "You can only leave before the game starts.",
    );
    g.players = g.players.filter((p) => p.id !== id);
    if (g.host === id) g.host = g.players[0]?.id ?? null;
    if (!g.players.length) g.phase = "closed";
    return;
  }
  if (a.type === "join") {
    throw new Error("Invalid action.");
  }
  if (a.type === "start") {
    requireThat(
      g.phase === "lobby" && id === g.host,
      "Only the host can start the lobby.",
    );
    requireThat(
      g.players.length >= 5 && g.players.length <= 10,
      "You need 5–10 players.",
    );
    const n = g.players.length,
      f = Math.floor((n - 3) / 2);
    const roles = shuffle([
      ...Array(n - f - 1).fill("liberal"),
      ...Array(f).fill("fascist"),
      "hitler",
    ]);
    g.players.forEach((p, i) => (p.role = roles[i]));
    g.deck = shuffle([
      ...Array(6).fill("liberal"),
      ...Array(11).fill("fascist"),
    ]);
    g.president = g.players[randomInt(n)].id;
    g.phase = "reveal";
    g.ready = [];
    log(g, "Roles dealt. The table is assembled.");
    return;
  }
  if (a.type === "ready") {
    requireThat(g.phase === "reveal", "Not revealing roles.");
    if (!g.ready.includes(id)) g.ready.push(id);
    if (g.ready.length === g.players.length) g.phase = "nominate";
    return;
  }
  requireThat(me.alive && g.phase !== "finished", "You cannot act now.");
  if (a.type === "nominate") {
    requireThat(
      g.phase === "nominate" && id === g.president,
      "Wait for the President.",
    );
    const p = g.players.find((p) => p.id === a.target);
    requireThat(p && eligible(g, p), "That player is not eligible.");
    g.chancellor = p.id;
    g.phase = "vote";
    g.votes = {};
    log(g, `${me.name} nominated ${p.name} as Chancellor.`);
    return;
  }
  if (a.type === "vote") {
    requireThat(
      g.phase === "vote" && typeof a.yes === "boolean" && !(id in g.votes),
      "You cannot vote now.",
    );
    g.votes[id] = a.yes;
    if (Object.keys(g.votes).length === alive(g).length) {
      g.lastVotes = { ...g.votes };
      const yes = Object.values(g.votes).filter(Boolean).length;
      log(
        g,
        `Government ${yes > alive(g).length / 2 ? "elected" : "rejected"} · ${yes} Ja / ${alive(g).length - yes} Nein.`,
      );
      if (yes > alive(g).length / 2) {
        g.lastPresident = g.president;
        g.lastChancellor = g.chancellor;
        if (
          g.fascist >= 3 &&
          g.players.find((p) => p.id === g.chancellor).role === "hitler"
        )
          return win(
            g,
            "fascist",
            "Hitler was elected Chancellor after three Fascist policies.",
          );
        refill(g);
        g.hand = g.deck.splice(0, 3);
        g.phase = "presidentDiscard";
      } else failed(g);
    }
    return;
  }
  if (a.type === "discard") {
    requireThat(
      (g.phase === "presidentDiscard" && id === g.president) ||
        (g.phase === "chancellorDiscard" && id === g.chancellor),
      "These policies are private.",
    );
    requireThat(
      Number.isInteger(a.index) && a.index >= 0 && a.index < g.hand.length,
      "Choose a policy.",
    );
    g.discard.push(g.hand.splice(a.index, 1)[0]);
    if (g.phase === "presidentDiscard") g.phase = "chancellorDiscard";
    else {
      const policy = g.hand.pop();
      enact(g, policy);
    }
    return;
  }
  if (a.type === "veto") {
    requireThat(
      g.phase === "chancellorDiscard" &&
        id === g.chancellor &&
        g.fascist >= 5 &&
        !g.vetoDenied,
      "Veto unavailable.",
    );
    g.phase = "veto";
    return;
  }
  if (a.type === "vetoAnswer") {
    requireThat(
      g.phase === "veto" && id === g.president && typeof a.yes === "boolean",
      "Only the President can answer.",
    );
    if (a.yes) {
      g.discard.push(...g.hand);
      g.hand = [];
      log(g, "The government agreed to veto its agenda.");
      failed(g);
    } else {
      g.vetoDenied = true;
      g.phase = "chancellorDiscard";
    }
    return;
  }
  if (a.type === "power") {
    requireThat(
      g.phase === "executive" && id === g.president,
      "Only the President can use this power.",
    );
    if (g.power === "peek") {
      me.notes.push(
        `Policy peek: ${g.deck.slice(0, 3).join(", ")} (top first).`,
      );
      next(g);
      return;
    }
    const p = g.players.find((p) => p.id === a.target);
    requireThat(p && p.alive && p.id !== id, "Choose another living player.");
    if (g.power === "investigate") {
      requireThat(!g.investigated.includes(p.id), "Already investigated.");
      g.investigated.push(p.id);
      me.notes.push(
        `${p.name}: ${p.role === "liberal" ? "Liberal" : "Fascist"} party membership.`,
      );
      log(g, `${me.name} investigated ${p.name}.`);
      next(g);
    } else if (g.power === "special") {
      g.resume = id;
      g.president = p.id;
      g.chancellor = null;
      g.phase = "nominate";
      g.round++;
      g.power = null;
      g.votes = {};
      g.vetoDenied = false;
      log(g, `${p.name} will lead a special election.`);
    } else if (g.power === "execute") {
      p.alive = false;
      log(g, `${p.name} was executed.`);
      if (p.role === "hitler") win(g, "liberal", "Hitler has been executed.");
      else next(g);
    } else throw new Error("Unknown executive power.");
    return;
  }
  throw new Error("Unknown action.");
}
export function view(g, id) {
  const me = g.players.find((p) => p.id === id);
  requireThat(me, "Invalid session.");
  const know =
    me.role === "fascist" || (me.role === "hitler" && g.players.length <= 6);
  return {
    code: g.code,
    version: g.version,
    host: g.host,
    phase: g.phase,
    liberal: g.liberal,
    fascist: g.fascist,
    tracker: g.tracker,
    round: g.round,
    president: g.president,
    chancellor: g.chancellor,
    power: g.power,
    winner: g.winner,
    reason: g.reason,
    ready: g.ready || [],
    vetoDenied: g.vetoDenied,
    deckCount: g.deck.length,
    discardCount: g.discard.length,
    log: g.log.slice(0, 60),
    lastVotes: g.lastVotes,
    voted: Object.keys(g.votes),
    investigated: g.investigated,
    players: g.players.map((p) => ({
      id: p.id,
      name: p.name,
      alive: p.alive,
      eligible: eligible(g, p),
      role:
        g.phase === "finished" || p.id === id || (know && p.role !== "liberal")
          ? p.role
          : undefined,
    })),
    me: { id, role: me.role, notes: me.notes },
    hand:
      (g.phase === "presidentDiscard" && id === g.president) ||
      (g.phase === "chancellorDiscard" && id === g.chancellor)
        ? g.hand
        : [],
  };
}
