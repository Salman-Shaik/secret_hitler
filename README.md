# Secret Hitler — The Digital Edition

A React + Node monolith built with Next.js App Router. An unofficial, noncommercial adaptation with a paper-and-ink board interface, private rooms, secret roles, sealed ballots, legislation, all player-count-specific powers, vetoes, election chaos, and automatic victories. Supports 5–10 human players. Use a voice call or sit together for discussion; no voice/chat service is included.

## Run locally

Requires Node.js 22 or later.

```sh
npm install
npm run dev
```

Open http://localhost:3000. Create a room and share the invitation. Use separate browsers/profiles/devices for separate players. A browser stores its bearer session locally and reconnects on reload. One player per browser profile. Rooms remain available for 24 hours after the last action. Local development uses process memory unless Redis credentials are configured; restarting the server clears those local rooms.

```sh
npm test
npm run build
```

Run `npm run test:coverage` for the enforced 100% application coverage gate, or `npm run test:e2e` to build and run the full production browser/API suite. `npm run test:all` runs both. See [the test guide](tests/README.md) for the scenario matrix, complete-game simulations, browser installation, and report locations. Format source with `npm run format`.

The header theme switch toggles light and dark mode and remembers your choice. Auto follows your operating system, including changes while the app is open; it is the default. Development and production use separate build folders. Browser tests use their own ports (3105 and 3199); see the test guide to override them.

## Deploy to Vercel

1. Push this directory to a Git repository and import it into Vercel. Select the Next.js preset. It deploys the React UI and Node API together; no separate backend server is needed.
2. Create an Upstash Redis database (or add Upstash from Vercel Marketplace).
3. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to the Vercel project environment. Never prefix these with `NEXT_PUBLIC_`. See `.env.example`.
4. Deploy. Create a room and test joining from a second device.

`vercel.json` selects Next.js, a locked `npm ci` install, and the production build. Node.js 22 is pinned in `package.json`. Keep `NEXT_DIST_DIR`, `TEST_PORT`, `TEST_REDIS_PORT`, and test-only Redis credentials out of Vercel environment settings. Production uses `.next`; `.next-test` is only for local/CI tests. Before uploading, run `npm run test:all` and `npm run build`. No deployment has been performed by this repository setup.

Redis is necessary because separate serverless invocations do not share durable process memory. The API fails explicitly on Vercel if credentials are missing. Updates use Redis Lua compare-and-set to prevent simultaneous actions from overwriting each other. Clients poll every 1.5 seconds; this avoids requiring a persistent socket server but consumes Redis reads while rooms are open. Storage and hosting are the only external services. No account or database schema setup is needed.

## Rules and privacy

`lib/game.js` is the authoritative state machine. The client never receives the policy deck, discard contents, other players’ session tokens, hidden ballots, or unauthorized roles. Investigations reveal party membership only. All actions validate the acting player, phase, and target. Roles and policy shuffles use Node cryptographic randomness. Sessions are bearer credentials: do not share your browser storage. Invite links contain only the room code.

The room host starts the game once 5–10 players have joined. Every player acknowledges their role before the first nomination. The rules dialog covers setup and gameplay and links to the original rulebook. Executed players must remain silent. Players can leave before the game starts. If the host leaves, the next player becomes host; empty lobbies close. There are no bots, spectators, or mid-game substitutions. Reconnect using the original browser; loss of its local session cannot be recovered. Public deployment should add rate limiting before promoting the app to a large audience.

## Credits and license

Original game: **Secret Hitler**, created by **Mike Boxleiter, Tommy Maranges, and Mac Schubert**, © Goat, Wolf & Cabbage. https://www.secrethitler.com/

This adaptation changes the presentation to a responsive web interface and automates setup, hidden-information delivery, and rules enforcement. It is unofficial and not endorsed by the original creators. No original illustration files are included.

This adaptation is released under **Creative Commons Attribution–NonCommercial–ShareAlike 4.0 International**, matching the original game. https://creativecommons.org/licenses/by-nc-sa/4.0/

Official rules: https://www.secrethitler.com/assets/Secret_Hitler_Rules.pdf

Third-party software dependencies retain their own licenses.
