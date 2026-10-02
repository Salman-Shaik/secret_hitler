// @vitest-environment jsdom
import React from "react";
import { test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act as reactAct,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Home from "../app/page.jsx";
import ThemeSwitch from "../app/theme-switch.jsx";
import Layout, { metadata } from "../app/layout.jsx";
import { setup, lobby } from "./helpers/game.js";
import { view } from "../lib/game.js";
let current, post, fetchMock, poll, media, writeText;
const session = { code: "ABCDEF", token: "secret" };
const response = (data, ok = true) => ({
  ok,
  json: async () => structuredClone(data),
});
beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/");
  media = {
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => media),
  );
  const interval = window.setInterval.bind(window);
  vi.spyOn(window, "setInterval").mockImplementation((fn, ms, ...args) => {
    if (ms === 1500) {
      poll = fn;
      return 123;
    }
    return interval(fn, ms, ...args);
  });
  writeText = vi.fn().mockResolvedValue();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  current = null;
  post = vi.fn(async (body) => {
    current.version++;
    return response({ game: current, token: "secret" });
  });
  fetchMock = vi.fn(async (url, options) =>
    options?.method === "POST"
      ? post(JSON.parse(options.body))
      : response(current),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function fixture(phase = "nominate", options = {}) {
  const { n = 7, identity = 0, ...overrides } = options;
  const g = phase === "lobby" ? lobby(n) : setup(n);
  g.phase = phase;
  if (phase === "reveal") g.ready = [];
  g.president = g.players[0].id;
  g.chancellor = g.players[1].id;
  g.lastVotes = { [g.players[0].id]: true, [g.players[1].id]: false };
  Object.assign(g, overrides);
  return view(g, g.players[identity].id);
}
async function mount(g) {
  current = g;
  if (g) localStorage.setItem("sh-session", JSON.stringify(session));
  render(<Home />);
  if (g) {
    await waitFor(() =>
      expect(document.querySelector(".action-panel")).not.toBeNull(),
    );
    await reactAct(async () => {});
  }
}
const click = (name) => fireEvent.click(screen.getByRole("button", { name }));
test.each(["liberal", "fascist"])(
  "distinct %s victory sound and mute",
  async (winner) => {
    const frequencies = [];
    vi.stubGlobal(
      "AudioContext",
      class {
        currentTime = 0;
        destination = {};
        createOscillator() {
          const frequency = {};
          frequencies.push(frequency);
          return { frequency, connect() {}, start() {}, stop() {} };
        }
        createGain() {
          return { connect() {}, gain: { setValueAtTime() {} } };
        }
      },
    );
    await mount(fixture("finished", { winner }));
    click("Enable action sounds");
    expect(frequencies.map((f) => f.value)).toEqual(
      winner === "liberal" ? [523, 659, 784, 1047] : [330, 311, 262, 196],
    );
    await reactAct(async () => poll());
    expect(frequencies).toHaveLength(4);
    click("Disable action sounds");
  },
);
test("role/action highlights, attention chime, and private peek review error recovery", async () => {
  const frequencies = [];
  vi.stubGlobal(
    "AudioContext",
    class {
      currentTime = 0;
      destination = {};
      createOscillator() {
        const frequency = {};
        frequencies.push(frequency);
        return { frequency, connect() {}, start() {}, stop() {} };
      }
      createGain() {
        return { connect() {}, gain: { setValueAtTime() {} } };
      }
    },
  );
  await mount(fixture("reveal"));
  expect(document.querySelector(".secret-panel")).toHaveClass(
    "action-required",
  );
  click("Enable action sounds");
  expect(frequencies.map((f) => f.value)).toEqual([660, 880]);
  click("Reveal secret role");
  expect(document.querySelector(".action-panel")).toHaveClass(
    "action-required",
  );
  current = fixture("peekReview", {
    deck: ["liberal", "fascist", "liberal"],
    version: 2,
  });
  await reactAct(async () => poll());
  expect(
    screen.getByRole("dialog", { name: "Private policy peek" }),
  ).toHaveTextContent("#1");
  post.mockResolvedValueOnce(response({ error: "Try again" }, false));
  click("Done reviewing · continue");
  await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
  expect(frequencies.slice(-2).map((f) => f.value)).toEqual([220, 165]);
  click("Done reviewing · continue");
  await sent("finishPeek");
  cleanup();
  await mount(fixture("peekReview", { identity: 1 }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.body.style.overflow).not.toBe("hidden");
});
test("vote stays focused and selected ballot survives another player's vote", async () => {
  await mount(fixture("vote"));
  expect(screen.getByRole("dialog", { name: "Cast your vote" })).toBeVisible();
  click("Ja! YES");
  current.version++;
  current.voted = [current.players[1].id];
  await reactAct(async () => poll());
  expect(screen.getByRole("dialog")).toHaveTextContent("Vote Ja (Yes)?");
  click("Change selection");
  expect(screen.getByRole("dialog", { name: "Cast your vote" })).toBeVisible();
  post.mockResolvedValueOnce(
    response({ error: "Try your ballot again" }, false),
  );
  click("Nein NO");
  await sent("vote", { yes: false });
  expect(
    screen.getByRole("dialog", { name: "Cast your vote" }),
  ).toHaveTextContent("Try your ballot again");
  click("How to play");
  expect(screen.getByRole("dialog", { name: "How to play" })).toBeVisible();
});
test("lobby host badge and ordinary modal Tab navigation", async () => {
  const g = lobby();
  await mount(view(g, g.host));
  expect(screen.getByText("HOST")).toBeVisible();
  click("How to play");
  screen.getByRole("button", { name: "Close rules" }).focus();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(screen.getByRole("dialog")).toBeVisible();
});
async function sent(type, extra = {}) {
  const confirm = screen.queryByRole("button", {
    name: /Confirm selection|Confirm Discarding/,
  });
  if (confirm) fireEvent.click(confirm);
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ type, ...extra }),
    ),
  );
  await reactAct(async () => {});
}
test("selection popup can be cancelled, keeps focus inside, and clears on a newer table", async () => {
  await mount(fixture("nominate"));
  const target = current.players[1].name;
  click(target);
  expect(post).not.toHaveBeenCalled();
  const dialog = screen.getByRole("dialog");
  fireEvent.click(dialog);
  expect(screen.getByRole("dialog")).toBeVisible();
  click("Change selection");
  expect(screen.queryByRole("dialog")).toBeNull();
  click(target);
  click("Cancel selection");
  click(target);
  fireEvent.click(screen.getByRole("dialog").parentElement);
  expect(screen.queryByRole("dialog")).toBeNull();
  click(target);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  click(target);
  screen.getByRole("button", { name: "Confirm selection" }).focus();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(
    screen.getByRole("button", { name: "Cancel selection" }),
  ).toHaveFocus();
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(
    screen.getByRole("button", { name: "Confirm selection" }),
  ).toHaveFocus();
  current.version++;
  current.phase = "vote";
  current.voted = [current.me.id];
  await reactAct(async () => poll());
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(post).not.toHaveBeenCalled();
});
test("President can change and deselect cards before passing exactly two", async () => {
  await mount(
    fixture("presidentDiscard", { hand: ["liberal", "fascist", "liberal"] }),
  );
  expect(
    screen.getByRole("button", { name: "Review selected policies" }),
  ).toBeDisabled();
  click("liberal SELECT POLICY 1");
  click("fascist SELECT POLICY 2");
  click("liberal SELECT POLICY 1");
  expect(
    screen.getByRole("button", { name: "Review selected policies" }),
  ).toBeDisabled();
  click("liberal SELECT POLICY 3");
  click("liberal SELECT POLICY 1");
  click("Review selected policies");
  expect(
    screen.getByText(/liberal \+ liberal will go privately/),
  ).toBeVisible();
  expect(post).not.toHaveBeenCalled();
  await sent("discard", { index: 1 });
});
test("layout contains bootstrap and children", () => {
  const tree = Layout({ children: <span>Child</span> });
  expect(tree.props.children[1].props.children.props.children).toBe("Child");
  expect(
    tree.props.children[0].props.children.props.dangerouslySetInnerHTML.__html,
  ).toContain("sh-theme");
  expect(metadata.title).toContain("Secret Hitler");
  expect(metadata.icons.icon).toBe("/icon.svg");
});
test("landing create, name entry, invitation code cleaning, join and saved session clearing", async () => {
  await mount(null);
  click("Join a room");
  fireEvent.change(screen.getByLabelText("ROOM CODE"), {
    target: { value: "abc!def" },
  });
  expect(screen.getByLabelText("ROOM CODE")).toHaveValue("ABCDEF");
  fireEvent.change(screen.getByLabelText("YOUR NAME"), {
    target: { value: "Ada" },
  });
  current = fixture("lobby", { n: 5 });
  click("Take your seat");
  await sent("join", { name: "Ada", code: "ABCDEF" });
  expect(JSON.parse(localStorage.getItem("sh-session")).token).toBe("secret");
});
test("create tab, sound success and audio cleanup", async () => {
  const close = vi.fn(),
    o = { connect: vi.fn(), frequency: {}, start: vi.fn(), stop: vi.fn() };
  vi.stubGlobal(
    "AudioContext",
    class {
      currentTime = 1;
      destination = {};
      createOscillator() {
        return o;
      }
      createGain() {
        return { connect: vi.fn(), gain: { setValueAtTime: vi.fn() } };
      }
      close = close;
    },
  );
  await mount(null);
  click("Join a room");
  click("Create a room");
  click("Enable action sounds");
  fireEvent.change(screen.getByLabelText("YOUR NAME"), {
    target: { value: "Ada" },
  });
  current = fixture("lobby");
  click("Create private room");
  await sent("create");
  expect(o.start).toHaveBeenCalled();
  o.onended();
  expect(close).toHaveBeenCalled();
  click("Disable action sounds");
});
test("bad saved data and query prefill, failed action and saved session recovery", async () => {
  localStorage.setItem("sh-session", "bad");
  history.replaceState(null, "", "/?room=abcdef");
  await mount(null);
  expect(screen.getByLabelText("ROOM CODE")).toHaveValue("ABCDEF");
  post.mockResolvedValue(response({ error: "Room expired" }, false));
  fireEvent.change(screen.getByLabelText("YOUR NAME"), {
    target: { value: "Ada" },
  });
  click("Take your seat");
  await screen.findByText("Room expired");
  cleanup();
  localStorage.setItem("sh-session", JSON.stringify(session));
  fetchMock.mockResolvedValue(response({ error: "Invalid session." }, false));
  render(<Home />);
  await screen.findByText("Invalid session.");
  click("Clear saved session");
  expect(localStorage.getItem("sh-session")).toBeNull();
});
test("rules open, stop propagation, keyboard trap, escape, backdrop and close", async () => {
  await mount(null);
  click("How to play");
  fireEvent.click(screen.getByRole("dialog"));
  expect(screen.getByRole("dialog")).toBeVisible();
  const close = screen.getByRole("button", { name: "Close rules" }),
    last = screen.getByRole("link", { name: "Read the original rulebook" });
  close.focus();
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(last).toHaveFocus();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(close).toHaveFocus();
  fireEvent.keyDown(document, { key: "Enter" });
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  click("Learn the game");
  fireEvent.click(document.querySelector(".modal-backdrop"));
  click("How to play");
  click("Close rules");
  expect(screen.queryByRole("dialog")).toBeNull();
});
test.each([true, false])("copy invitation success=%s", async (success) => {
  await mount(fixture("lobby"));
  if (!success) writeText.mockRejectedValue(new Error());
  click("Invite friends · ABCDEF");
  if (success) {
    await screen.findByText("Invitation copied");
    expect(writeText).toHaveBeenCalledWith("http://localhost:3000?room=ABCDEF");
  } else await screen.findByText("Room code: ABCDEF");
});
test("lobby host start and guest waiting", async () => {
  await mount(fixture("lobby"));
  click("Start game · 7/10 players");
  await sent("start");
  cleanup();
  await mount(fixture("lobby", { identity: 1 }));
  expect(
    screen.getByRole("button", { name: "Waiting for the host" }),
  ).toBeDisabled();
});
test("leave clears session and failed leave preserves room", async () => {
  await mount(fixture("lobby"));
  post.mockResolvedValueOnce(response({ error: "changed" }, false));
  click("Leave lobby");
  await screen.findByText("changed");
  expect(localStorage.getItem("sh-session")).not.toBeNull();
  post.mockResolvedValueOnce(response({ left: true }));
  click("Leave lobby");
  await screen.findByRole("button", { name: "Create private room" });
  expect(localStorage.getItem("sh-session")).toBeNull();
});
test("roles and intel reveal/hide, acknowledge and waiting", async () => {
  await mount(fixture("reveal"));
  click(/FOR YOUR EYES ONLY/);
  expect(
    screen.getByText("Protect the republic. Find people you can trust."),
  ).toBeVisible();
  click("Hide secret role");
  click("Reveal secret role");
  click("I know my role");
  await sent("ready");
  current.ready = [current.me.id];
  await reactAct(() => poll());
  expect(
    screen.getByRole("button", { name: "Waiting for the table…" }),
  ).toBeDisabled();
  cleanup();
  const g = fixture("reveal", { identity: 5 });
  g.me.notes = ["Secret intel"];
  await mount(g);
  click(/FOR YOUR EYES ONLY/);
  expect(screen.getByText("Secret intel")).toBeVisible();
  expect(screen.getByText(/Advance Fascist policies/)).toBeVisible();
});
test.each([0, 2])("nomination as player %i", async (identity) => {
  await mount(fixture("nominate", { identity }));
  if (identity === 0) {
    click("P1");
    await sent("nominate", { target: current.players[1].id });
  } else expect(screen.getByText(/P0 is choosing/)).toBeVisible();
});
test.each([true, false])("vote %s sends sealed ballot", async (yes) => {
  await mount(fixture("vote"));
  click(yes ? "Ja! YES" : "Nein NO");
  await sent("vote", { yes });
  current.voted = [current.me.id];
  await reactAct(() => poll());
  expect(screen.getByText("Your ballot is sealed.")).toBeVisible();
});
test("dead players observe, vote results and unknown president fallback", async () => {
  const g = fixture("vote");
  g.players[0].alive = false;
  g.president = "missing";
  await mount(g);
  expect(screen.getByText("You are observing the table.")).toBeVisible();
  expect(screen.getByText("EXECUTED")).toBeVisible();
  expect(screen.getByText("Last vote: Ja!")).toBeVisible();
  expect(screen.getByText("Last vote: Nein")).toBeVisible();
});
test.each(["presidentDiscard", "chancellorDiscard"])(
  "private legislation %s",
  async (phase) => {
    await mount(
      fixture(phase, {
        identity: phase === "presidentDiscard" ? 0 : 1,
        hand:
          phase === "presidentDiscard"
            ? ["liberal", "fascist", "fascist"]
            : ["liberal", "fascist"],
        fascist: 5,
        liberal: 2,
      }),
    );
    click("fascist SELECT POLICY 2");
    if (phase === "presidentDiscard") click("fascist SELECT POLICY 3");
    click("Review selected policies");
    await sent("discard", { index: 0 });
    if (phase === "chancellorDiscard") {
      click("Request a veto");
      await sent("veto");
    }
  },
);
test.each(["presidentDiscard", "chancellorDiscard"])(
  "observer sees no cards in %s",
  async (phase) => {
    await mount(fixture(phase, { identity: 2, hand: ["liberal", "fascist"] }));
    expect(screen.queryByText("DISCARD THIS POLICY")).toBeNull();
    expect(screen.getByText(/is reviewing private policies/)).toBeVisible();
  },
);
test.each([true, false])("President veto answer %s", async (yes) => {
  await mount(fixture("veto"));
  click(yes ? "Agree to veto" : "Reject veto");
  await sent("vetoAnswer", { yes });
});
test("veto observer and denied veto hide controls", async () => {
  await mount(fixture("veto", { identity: 2 }));
  expect(screen.queryByText("Agree to veto")).toBeNull();
  cleanup();
  await mount(
    fixture("chancellorDiscard", {
      identity: 1,
      hand: ["liberal", "fascist"],
      fascist: 5,
      vetoDenied: true,
    }),
  );
  expect(screen.queryByText("Request a veto")).toBeNull();
});
test.each(["peek", "investigate", "special", "execute"])(
  "executive %s actions and observer",
  async (power) => {
    const g = fixture("executive", { power, n: 9 });
    g.players[2].alive = false;
    g.investigated = [g.players[3].id];
    await mount(g);
    if (power === "peek") click("Peek at top three policies");
    else {
      if (power === "investigate")
        expect(screen.queryByRole("button", { name: "P3" })).toBeNull();
      click("P1");
    }
    await sent("power");
    cleanup();
    await mount(fixture("executive", { power, identity: 1 }));
    expect(screen.getByText(/P0 must use/)).toBeVisible();
  },
);
test.each(["liberal", "fascist"])(
  "finished %s reveals roles and resets",
  async (winner) => {
    await mount(
      fixture("finished", {
        winner,
        reason: "Victory reason",
        liberal: 5,
        fascist: 6,
      }),
    );
    expect(
      screen.getByText(
        winner === "liberal" ? "Liberals win." : "Fascists win.",
      ),
    ).toBeVisible();
    click("Set up another game");
    expect(localStorage.getItem("sh-session")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Create private room" }),
    ).toBeVisible();
  },
);
test("poll ignores older responses and recovers network failures", async () => {
  await mount(fixture());
  const old = structuredClone(current);
  current.version = 4;
  current.round = 4;
  await reactAct(() => poll());
  current = old;
  await reactAct(() => poll());
  expect(screen.getByText("ROUND 04")).toBeVisible();
  fetchMock.mockRejectedValueOnce(new Error("offline"));
  await reactAct(() => poll());
  expect(
    screen.getByText("Connection interrupted. Reconnecting…"),
  ).toBeVisible();
  await reactAct(() => poll());
  expect(screen.queryByRole("alert")).toBeNull();
});
test("unmounted requests and errors do not update UI", async () => {
  let finish;
  fetchMock.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  localStorage.setItem("sh-session", JSON.stringify(session));
  const result = render(<Home />);
  result.unmount();
  await reactAct(() => finish(response(fixture())));
  let reject;
  fetchMock.mockImplementation(
    () =>
      new Promise((_, r) => {
        reject = r;
      }),
  );
  const again = render(<Home />);
  again.unmount();
  await reactAct(() => reject(new Error("offline")));
});
test("out-of-order mutation response does not undo newer poll and unsupported audio is harmless", async () => {
  await mount(fixture("lobby"));
  click("Enable action sounds");
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        throw Error("unavailable");
      }
    },
  );
  let finish;
  post.mockImplementation(() => new Promise((r) => (finish = r)));
  click("Start game · 7/10 players");
  const old = structuredClone(current);
  current.version = 10;
  current.round = 10;
  await reactAct(() => poll());
  await reactAct(() => finish(response({ game: old, token: "secret" })));
  expect(screen.getByText("ROUND 10")).toBeVisible();
});
test("in-flight poll cannot restore lobby after leaving", async () => {
  await mount(fixture("lobby"));
  let finish;
  fetchMock.mockImplementationOnce(() => new Promise((r) => (finish = r)));
  const pending = poll();
  post.mockResolvedValue(response({ left: true }));
  click("Leave lobby");
  await screen.findByRole("button", { name: "Create private room" });
  await reactAct(async () => {
    finish(response(current));
    await pending;
  });
  expect(screen.queryByText("Trust is a dangerous game.")).toBeNull();
});
test.each(["system", "light", "dark", "invalid"])(
  "theme preference %s and live system changes",
  async (saved) => {
    localStorage.setItem("sh-theme", saved);
    media.matches = true;
    render(<ThemeSwitch />);
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute(
      "aria-checked",
      saved === "light" ? "false" : "true",
    );
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    click("Use system theme");
    media.matches = false;
    await reactAct(() => media.addEventListener.mock.calls.at(-1)[1]());
    expect(toggle).toHaveAttribute("aria-checked", "false");
  },
);
test("theme tolerates blocked storage", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw Error();
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error();
  });
  render(<ThemeSwitch />);
  fireEvent.click(screen.getByRole("switch"));
  expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
});
