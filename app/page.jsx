"use client";
import { useEffect, useRef, useState } from "react";
import ThemeSwitch from "./theme-switch";
import {
  ArrowUpRight,
  Users,
  Copy,
  Eye,
  EyeOff,
  BookOpen,
  X,
  Shield,
  Feather,
  Skull,
  Crown,
  Check,
  ArrowRight,
  Fingerprint,
  Volume2,
} from "lucide-react";
const powerSets = (n) =>
  n <= 6
    ? ["", "", "peek", "execute", "execute", ""]
    : n <= 8
      ? ["", "investigate", "special", "execute", "execute", ""]
      : ["investigate", "investigate", "special", "execute", "execute", ""];
const labels = {
  peek: "Policy peek",
  investigate: "Investigate loyalty",
  special: "Special election",
  execute: "Execution",
};
function Emblem({ type, size = 30 }) {
  return type === "liberal" ? <Feather size={size} /> : <Skull size={size} />;
}
function Track({ type, count = 0, n = 7 }) {
  const liberal = type === "liberal",
    total = liberal ? 5 : 6;
  return (
    <section className={`track ${type}`}>
      <div className="track-heading">
        <div>
          <span className="eyebrow">
            {liberal ? "THE FOUNDATION OF FREEDOM" : "THE ROAD TO DICTATORSHIP"}
          </span>
          <h2>
            {liberal ? "Liberal" : "Fascist"} <span>POLICIES</span>
          </h2>
        </div>
        <Emblem type={type} size={44} />
      </div>
      <div className="slots">
        {Array.from({ length: total }, (_, i) => (
          <div className={`slot ${i < count ? "enacted" : ""}`} key={i}>
            <span className="slot-num">0{i + 1}</span>
            {i < count ? (
              <>
                <Emblem type={type} size={32} />
                <b>ENACTED</b>
              </>
            ) : (
              <>
                <span className="slot-icon">
                  {i === total - 1 ? (
                    <Crown size={26} />
                  ) : !liberal && powerSets(n)[i] ? (
                    powerSets(n)[i] === "execute" ? (
                      <Skull size={23} />
                    ) : powerSets(n)[i] === "special" ? (
                      <Crown size={23} />
                    ) : (
                      <Eye size={23} />
                    )
                  ) : (
                    <span className="dash">✦</span>
                  )}
                </span>
                <b>
                  {i === total - 1
                    ? "VICTORY"
                    : !liberal
                      ? labels[powerSets(n)[i]] || "Policy"
                      : "Policy"}
                </b>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="track-foot">
        <span>
          {liberal
            ? "Enact 5 Liberal policies to win."
            : "After 3 policies, electing Hitler Chancellor wins."}
        </span>
        <b>
          {count} / {total}
        </b>
      </div>
    </section>
  );
}
export default function Home() {
  const leaving = useRef(false);
  const [game, setGame] = useState(null),
    [session, setSession] = useState(null),
    [name, setName] = useState(""),
    [code, setCode] = useState(""),
    [tab, setTab] = useState("create"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [rules, setRules] = useState(false),
    [reveal, setReveal] = useState(false),
    [copied, setCopied] = useState(false),
    [sound, setSound] = useState(false);
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("sh-session"));
      if (s) setSession(s);
    } catch {}
    const c = new URLSearchParams(location.search).get("room");
    if (c) {
      setCode(c.toUpperCase());
      setTab("join");
    }
  }, []);
  useEffect(() => {
    if (!rules) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handle = (e) => {
      if (e.key === "Escape") setRules(false);
      if (e.key === "Tab") {
        const items = [
          ...document.querySelectorAll(".rules-modal button, .rules-modal a"),
        ];
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [rules]);
  useEffect(() => {
    if (!session) return;
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/game?code=${session.code}`, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        const data = await res.json();
        if (!stopped && !leaving.current) {
          if (res.ok) {
            setGame((old) =>
              !old || data.version >= old.version ? data : old,
            );
            setError("");
          } else setError(data.error);
        }
      } catch {
        if (!stopped) setError("Connection interrupted. Reconnecting…");
      }
    };
    poll();
    const interval = setInterval(poll, 1500);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [session]);
  async function send(type, extra = {}) {
    if (type === "leave") leaving.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/game", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
        },
        body: JSON.stringify({
          type,
          name,
          code: game?.code || code,
          version: game?.version,
          ...extra,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (type === "leave") {
        localStorage.removeItem("sh-session");
        setSession(null);
        setGame(null);
        setReveal(false);
        setCode("");
        setTab("create");
        history.replaceState(null, "", location.pathname);
        return;
      }
      leaving.current = false;
      setGame((old) =>
        !old || old.code !== data.game.code || data.game.version >= old.version
          ? data.game
          : old,
      );
      if (type === "create" || type === "join") {
        const s = { code: data.game.code, token: data.token };
        localStorage.setItem("sh-session", JSON.stringify(s));
        setSession(s);
      }
      if (sound) {
        try {
          const audio = new AudioContext();
          const o = audio.createOscillator(),
            gain = audio.createGain();
          o.connect(gain);
          gain.connect(audio.destination);
          gain.gain.setValueAtTime(0.025, audio.currentTime);
          o.frequency.value = 440;
          o.start();
          o.stop(audio.currentTime + 0.08);
          o.onended = () => audio.close();
        } catch {}
      }
    } catch (e) {
      leaving.current = false;
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}?room=${game.code}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(`Room code: ${game.code}`);
    }
  }
  const me = game?.me.id,
    isPresident = game?.president === me,
    isChancellor = game?.chancellor === me,
    find = (id) => game?.players.find((p) => p.id === id)?.name || "—";
  const phase = game?.phase;
  const phaseTitles = {
    lobby: "A conspiracy needs company.",
    reveal: "Open your secret envelope.",
    nominate: "A government begins with trust.",
    vote: "The floor is yours. Vote.",
    presidentDiscard: "Three policies. One decision.",
    chancellorDiscard: "Decide the future.",
    veto: "An agenda in the balance.",
    executive: labels[game?.power],
    finished: `${game?.winner === "liberal" ? "Liberals" : "Fascists"} win.`,
  };
  function actions() {
    if (phase === "lobby")
      return (
        <>
          <p>
            Share the invitation and gather 5–10 players. Use a voice call or
            play together in the same room.
          </p>
          <button
            className="primary"
            onClick={() => send("start")}
            disabled={busy || game.host !== me || game.players.length < 5}
          >
            {game.host !== me
              ? "Waiting for the host"
              : `Start game · ${game.players.length}/10 players`}
            <ArrowRight size={17} />
          </button>
        </>
      );
    if (phase === "reveal")
      return (
        <>
          <p>
            Check your role and any known allies in your private envelope, then
            confirm you’re ready.
          </p>
          <button
            className="primary"
            disabled={busy || game.ready.includes(me)}
            onClick={() => send("ready")}
          >
            {game.ready.includes(me)
              ? "Waiting for the table…"
              : "I know my role"}
            <Check size={17} />
          </button>
          <small>
            {game.ready.length} of {game.players.length} ready
          </small>
        </>
      );
    if (phase === "nominate")
      return (
        <>
          <p>
            {isPresident
              ? "Choose an eligible player below to nominate as Chancellor."
              : `${find(game.president)} is choosing a Chancellor. Discuss who you trust.`}
          </p>
          {isPresident && (
            <div className="choices">
              {game.players
                .filter((p) => p.eligible)
                .map((p) => (
                  <button
                    disabled={busy}
                    key={p.id}
                    onClick={() => send("nominate", { target: p.id })}
                  >
                    {p.name}
                    <ArrowUpRight size={14} />
                  </button>
                ))}
            </div>
          )}
        </>
      );
    if (phase === "vote")
      return (
        <>
          <p>
            <b>{find(game.president)}</b> as President.{" "}
            <b>{find(game.chancellor)}</b> as Chancellor. Does this government
            have your confidence?
          </p>
          {game.players.find((p) => p.id === me)?.alive &&
          !game.voted.includes(me) ? (
            <div className="ballots">
              <button
                disabled={busy}
                onClick={() => send("vote", { yes: true })}
              >
                Ja! <span>YES</span>
              </button>
              <button
                disabled={busy}
                onClick={() => send("vote", { yes: false })}
              >
                Nein <span>NO</span>
              </button>
            </div>
          ) : (
            <p className="muted">
              {game.voted.includes(me)
                ? "Your ballot is sealed."
                : "You are observing the table."}
            </p>
          )}
          <small>
            {game.voted.length} / {game.players.filter((p) => p.alive).length}{" "}
            ballots submitted
          </small>
        </>
      );
    if (game.hand.length)
      return (
        <>
          <p>
            Keep this session silent. Select the policy to <b>discard</b>.{" "}
            {isChancellor
              ? "The other policy will be enacted."
              : "The remaining two go to the Chancellor."}
          </p>
          <div className="policy-hand">
            {game.hand.map((p, i) => (
              <button
                className={`policy ${p}`}
                aria-label={`${p} DISCARD THIS POLICY`}
                key={i}
                disabled={busy}
                onClick={() => send("discard", { index: i })}
              >
                <Emblem type={p} size={30} />
                <b>{p}</b>
                <span>DISCARD THIS POLICY</span>
              </button>
            ))}
          </div>
          {isChancellor && game.fascist >= 5 && !game.vetoDenied && (
            <button disabled={busy} onClick={() => send("veto")}>
              Request a veto
            </button>
          )}
        </>
      );
    if (phase === "veto")
      return (
        <>
          <p>
            The Chancellor requested a veto. Both leaders must agree to discard
            the agenda.
          </p>
          {isPresident && (
            <div className="choices">
              <button
                disabled={busy}
                onClick={() => send("vetoAnswer", { yes: true })}
              >
                Agree to veto
              </button>
              <button
                disabled={busy}
                onClick={() => send("vetoAnswer", { yes: false })}
              >
                Reject veto
              </button>
            </div>
          )}
        </>
      );
    if (phase === "executive")
      return (
        <>
          <p>
            {isPresident
              ? "You must use your executive power before play continues."
              : `${find(game.president)} must use ${labels[game.power].toLowerCase()}.`}
          </p>
          {isPresident &&
            (game.power === "peek" ? (
              <button
                className="primary"
                disabled={busy}
                onClick={() => send("power")}
              >
                Peek at top three policies
                <Eye size={17} />
              </button>
            ) : (
              <div className="choices">
                {game.players
                  .filter(
                    (p) =>
                      p.alive &&
                      p.id !== me &&
                      (game.power !== "investigate" ||
                        !game.investigated.includes(p.id)),
                  )
                  .map((p) => (
                    <button
                      disabled={busy}
                      key={p.id}
                      onClick={() => send("power", { target: p.id })}
                    >
                      {p.name}
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
              </div>
            ))}
        </>
      );
    if (phase === "finished")
      return (
        <>
          <p>{game.reason} All roles are now revealed at the table.</p>
          <button
            className="primary"
            onClick={() => {
              setGame(null);
              setSession(null);
              setReveal(false);
              localStorage.removeItem("sh-session");
            }}
          >
            Set up another game
            <ArrowRight size={17} />
          </button>
        </>
      );
    return (
      <p>
        {find(phase === "presidentDiscard" ? game.president : game.chancellor)}{" "}
        is reviewing private policies. The legislative session must remain
        silent.
      </p>
    );
  }
  return (
    <>
      <header>
        <a className="brand" href="/">
          SECRET<span>HITLER</span>
          <i>THE DIGITAL EDITION</i>
        </a>
        <nav>
          <ThemeSwitch />
          <span className="desktop-label">A GAME OF TRUST & TREASON</span>
          <button className="nav-button" onClick={() => setRules(true)}>
            <BookOpen size={16} />
            How to play
          </button>
          <button
            className={`icon-button ${sound ? "active" : ""}`}
            aria-label={
              sound ? "Disable action sounds" : "Enable action sounds"
            }
            onClick={() => setSound(!sound)}
          >
            <Volume2 size={18} />
          </button>
        </nav>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              <span className="live-dot" />
              {game ? "PRIVATE TABLE · " + game.code : "THE TABLE IS SET"}
            </div>
            <h1>
              {game
                ? "Trust is a dangerous game."
                : "Good friends. Bad intentions."}
            </h1>
            <p>
              {game
                ? "Watch the votes. Question the motives. Keep your secret."
                : "A familiar table. A hidden identity. A very convincing lie."}
            </p>
          </div>
          <div className="edition">
            <span>EST.</span>
            <b>1932</b>
            <span>5–10 PLAYERS</span>
          </div>
        </div>
        <div className="workspace">
          <div className="board-area">
            <div className="section-label">
              <span>01 / THE POLICY BOARDS</span>
              <span>
                {game
                  ? `ROUND ${String(game.round).padStart(2, "0")}`
                  : "THE FATE OF THE REPUBLIC"}
              </span>
            </div>
            <Track
              type="liberal"
              count={game?.liberal}
              n={game?.players.length}
            />
            <Track
              type="fascist"
              count={game?.fascist}
              n={game?.players.length}
            />
            <div className="tracker">
              <div>
                <span className="eyebrow">ELECTION TRACKER</span>
                <p>Three failed governments. One forced policy.</p>
              </div>
              <div className="tracker-dots">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    className={i === (game?.tracker || 0) ? "current" : ""}
                    key={i}
                  >
                    {i === 3 ? <Skull size={16} /> : i}
                  </div>
                ))}
              </div>
              <div className="deck-info">
                <b>{game?.deckCount ?? 17}</b>
                <span>DRAW PILE</span>
              </div>
              <div className="deck-info">
                <b>{game?.discardCount ?? 0}</b>
                <span>DISCARD</span>
              </div>
            </div>
            {game ? (
              <section className="table">
                <div className="section-label">
                  <span>02 / AROUND THE TABLE</span>
                  <span>{game.players.length} PLAYERS</span>
                </div>
                <div className="players">
                  {game.players.map((p, i) => (
                    <div
                      className={`player ${!p.alive ? "dead" : ""} ${p.id === game.president ? "president" : ""}`}
                      key={p.id}
                    >
                      <div className="avatar">
                        {p.alive ? (
                          p.name.slice(0, 1).toUpperCase()
                        ) : (
                          <Skull size={20} />
                        )}
                        <span>{i + 1}</span>
                      </div>
                      <b>
                        {p.name}
                        {p.id === me ? " (you)" : ""}
                      </b>
                      <small>
                        {!p.alive
                          ? "EXECUTED"
                          : p.id === game.president
                            ? "PRESIDENT"
                            : p.id === game.chancellor
                              ? "CHANCELLOR"
                              : game.phase === "lobby" && p.id === game.host
                                ? "HOST"
                                : "AT THE TABLE"}
                      </small>
                      {phase === "finished" && <em>{p.role}</em>}
                      {game.lastVotes && p.id in game.lastVotes && (
                        <span
                          className={`vote-tag ${game.lastVotes[p.id] ? "yes" : "no"}`}
                        >
                          Last vote: {game.lastVotes[p.id] ? "Ja!" : "Nein"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <section className="intro-bottom">
                <div className="seal">
                  <Fingerprint size={42} />
                </div>
                <div>
                  <h3>Everyone has a secret.</h3>
                  <p>
                    Liberals seek the truth. Fascists sow doubt.
                    <br />
                    And one player is hiding in plain sight.
                  </p>
                </div>
                <button className="text-button" onClick={() => setRules(true)}>
                  Learn the game
                  <ArrowUpRight size={17} />
                </button>
              </section>
            )}
          </div>
          <aside>
            {!game ? (
              <section className="room-panel">
                <div className="panel-kicker">
                  <Users size={18} />
                  <span>GATHER YOUR PEOPLE</span>
                </div>
                <h2>
                  Your table.
                  <br />
                  Your conspiracy.
                </h2>
                <p>
                  Invite your friends to a private room.
                  <br />
                  We’ll deal with the secrets.
                </p>
                <div className="tabs">
                  <button
                    className={tab === "create" ? "selected" : ""}
                    onClick={() => setTab("create")}
                  >
                    Create a room
                  </button>
                  <button
                    className={tab === "join" ? "selected" : ""}
                    onClick={() => setTab("join")}
                  >
                    Join a room
                  </button>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    send(tab);
                  }}
                >
                  <label htmlFor="name">YOUR NAME</label>
                  <input
                    id="name"
                    required
                    maxLength={24}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="What should we call you?"
                    autoComplete="nickname"
                  />
                  {tab === "join" && (
                    <>
                      <label htmlFor="code">ROOM CODE</label>
                      <input
                        id="code"
                        required
                        minLength={6}
                        maxLength={6}
                        value={code}
                        onChange={(e) =>
                          setCode(
                            e.target.value.toUpperCase().replace(/[^A-Z]/g, ""),
                          )
                        }
                        placeholder="ABCDEF"
                      />
                    </>
                  )}
                  <button className="primary" disabled={busy}>
                    {busy
                      ? "Setting the table…"
                      : tab === "create"
                        ? "Create private room"
                        : "Take your seat"}
                    <ArrowRight size={18} />
                  </button>
                </form>
                <div className="room-facts">
                  <span>
                    <Users size={14} />
                    5–10 players
                  </span>
                  <span>◷ 30–45 minutes</span>
                </div>
                <div className="privacy">
                  <Shield size={18} />
                  <span>
                    No accounts. No peeking.
                    <br />
                    Just you and your questionable friends.
                  </span>
                </div>
                {session && (
                  <button
                    className="text-button"
                    onClick={() => {
                      localStorage.removeItem("sh-session");
                      setSession(null);
                    }}
                  >
                    Clear saved session
                  </button>
                )}
              </section>
            ) : (
              <>
                <section className="action-panel">
                  <div className="panel-kicker">
                    <span className="live-dot" />
                    {phase === "lobby"
                      ? "WAITING ROOM"
                      : phase === "finished"
                        ? "THE VERDICT"
                        : `ROUND ${game.round} · ${phase === "vote" ? "ELECTION" : phase === "executive" ? "EXECUTIVE ACTION" : "THE GOVERNMENT"}`}
                  </div>
                  <h2>{phaseTitles[phase]}</h2>
                  {actions()}
                  {phase === "lobby" && (
                    <button
                      className="leave-lobby"
                      disabled={busy}
                      onClick={() => send("leave")}
                    >
                      Leave lobby <ArrowRight size={14} />
                    </button>
                  )}
                  <button className="invite" onClick={copy}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
                    {copied
                      ? "Invitation copied"
                      : `Invite friends · ${game.code}`}
                  </button>
                </section>
                {phase !== "lobby" && (
                  <section className="secret-panel">
                    <div className="section-label">
                      <span>YOUR PRIVATE ENVELOPE</span>
                      <button
                        className="icon-button"
                        aria-label={
                          reveal ? "Hide secret role" : "Reveal secret role"
                        }
                        onClick={() => setReveal(!reveal)}
                      >
                        {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {reveal ? (
                      <>
                        <h3
                          className={
                            game.me.role === "liberal"
                              ? "blue-text"
                              : "red-text"
                          }
                        >
                          {game.me.role}
                        </h3>
                        <p>
                          {game.me.role === "liberal"
                            ? "Protect the republic. Find people you can trust."
                            : "Advance Fascist policies. Protect Hitler’s identity."}
                        </p>
                        {game.players
                          .filter((p) => p.id !== me && p.role)
                          .map((p) => (
                            <p key={p.id}>
                              <b>{p.name}</b> · {p.role}
                            </p>
                          ))}
                        {game.me.notes.map((note, i) => (
                          <p className="private-note" key={i}>
                            {note}
                          </p>
                        ))}
                      </>
                    ) : (
                      <button
                        className="envelope"
                        onClick={() => setReveal(true)}
                      >
                        <Fingerprint size={28} />
                        <span>
                          FOR YOUR EYES ONLY
                          <small>Click to reveal your role & intel</small>
                        </span>
                      </button>
                    )}
                  </section>
                )}
                <section className="ledger">
                  <div className="section-label">
                    <span>THE PUBLIC RECORD</span>
                    <Feather size={15} />
                  </div>
                  {game.log.length ? (
                    game.log.map((l) => <p key={l.id}>{l.message}</p>)
                  ) : (
                    <p>Your story starts when everyone takes a seat.</p>
                  )}
                </section>
              </>
            )}
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <div className="table-note">
              <span>✦</span>
              <p>
                “The most dangerous player at the table
                <br />
                is the one you trust the most.”
              </p>
            </div>
          </aside>
        </div>
      </main>
      <footer>
        <span>
          SECRET HITLER <b> / </b> AN UNOFFICIAL DIGITAL ADAPTATION
        </span>
        <a
          href="https://www.secrethitler.com/"
          target="_blank"
          rel="noreferrer"
        >
          Original game by Mike Boxleiter, Tommy Maranges & Mac Schubert ↗
        </a>
        <a
          href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
          target="_blank"
          rel="noreferrer"
        >
          CC BY-NC-SA 4.0
        </a>
      </footer>
      {rules && (
        <div className="modal-backdrop" onClick={() => setRules(false)}>
          <section
            className="rules-modal"
            role="dialog"
            aria-modal="true"
            aria-label="How to play"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close icon-button"
              aria-label="Close rules"
              autoFocus
              onClick={() => setRules(false)}
            >
              <X />
            </button>
            <span className="eyebrow">THE FIELD GUIDE</span>
            <h2>Trust carefully.</h2>
            <p>
              5–10 players. Private roles. Public consequences. Talk together in
              person or on a voice call.
            </p>
            <h3>01 · The setup</h3>
            <p>
              For 5 / 6 / 7 / 8 / 9 / 10 players, use 3 / 4 / 4 / 5 / 5 / 6
              Liberals, 1 / 1 / 2 / 2 / 3 / 3 Fascists, and one Hitler. The deck
              contains 6 Liberal and 11 Fascist policies. Your room handles this
              automatically.
            </p>
            <p>
              Fascists know one another and Hitler. Hitler knows the Fascist
              only in 5–6 player games. Liberals know only themselves. Check
              your envelope privately.
            </p>
            <h3>02 · Elect a government</h3>
            <p>
              The presidency rotates through living players. The President
              nominates another eligible player as Chancellor. The previous
              elected Chancellor is ineligible; the previous elected President
              is also ineligible with more than five living players. All living
              players vote secretly, then ballots are revealed together. A
              strict majority of Ja votes elects the government; ties fail.
            </p>
            <h3>03 · Pass a policy</h3>
            <p>
              The President privately discards one of three policies. The
              Chancellor privately discards one of the remaining two, enacting
              the other. Stay silent during legislation. You can lie about what
              you saw afterward. When fewer than three remain, the remaining
              deck and discards are shuffled together.
            </p>
            <p>
              Failed elections advance the tracker. At three, the top policy is
              enacted without an executive power, term limits clear, and the
              tracker resets. Any enacted policy resets the tracker; merely
              electing a government does not.
            </p>
            <h3>04 · Executive powers</h3>
            <p>
              The Fascist board depends on the initial player count. At 5–6:
              policy peek on slot 3. At 7–8: investigate on slot 2 and special
              election on slot 3. At 9–10: investigate on slots 1 and 2, special
              election on slot 3. All boards grant execution on slots 4 and 5.
            </p>
            <p>
              Investigation reveals party membership, never the Hitler role.
              Each player may be investigated once. Policy peek shows the next
              three in order. A special election appoints another living
              President; afterward rotation resumes after the President who
              called it. Execution removes a player from speaking, voting, or
              holding office; only killing Hitler reveals a role immediately.
            </p>
            <h3>05 · Veto & victory</h3>
            <p>
              After five Fascist policies, the Chancellor may request a veto
              after receiving two policies. If the President agrees, both are
              discarded and the election tracker advances; term limits still
              apply. If refused, the Chancellor must enact a policy.
            </p>
            <p>
              Liberals win with five policies or Hitler’s execution. Fascists
              win with six policies, or Hitler elected Chancellor after at least
              three Fascist policies.
            </p>
            <a
              className="primary"
              href="https://www.secrethitler.com/assets/Secret_Hitler_Rules.pdf"
              target="_blank"
              rel="noreferrer"
            >
              Read the original rulebook
              <ArrowUpRight size={16} />
            </a>
          </section>
        </div>
      )}
    </>
  );
}
