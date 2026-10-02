# Test suite

## Commands

- `npm test`: unit and React component tests.
- `npm run test:coverage`: same suite with **100% statements, branches, functions, and lines** required. HTML report: `coverage/index.html`; machine-readable summary: `coverage/coverage-summary.json`.
- `npm run test:e2e`: builds an isolated production app in `.next-test`, then runs Playwright against the real UI and Node API.
- `npm run test:all`: coverage gate followed by the production E2E suite.
- `npm run test:browser -- --grep "veto"`: rerun selected browser scenarios against an existing `.next-test` build. Tests start their own servers.

Coverage includes **every JavaScript/JSX source file under `app/` and `lib/`**, including files that have never been imported by a test. No application files or uncovered lines are excluded. CSS, build configuration, dependencies, and test utilities are not application execution coverage. Component tests use jsdom and mock browser/network boundaries; rules and API tests execute the real state machine.

On Windows, tests use installed Microsoft Edge. On Linux/macOS, install Chromium with `npx playwright install chromium`. Override with `PLAYWRIGHT_CHANNEL`. The application test port defaults to 3105 and test storage to 3199; override with `TEST_PORT` and `TEST_REDIS_PORT`. Test servers refuse to reuse unrelated servers. GitHub Actions installs Chromium, runs both suites, and uploads reports.

## Scenario matrix

| Area              | Unit/component checks                                                                                                 | Production E2E checks                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Setup             | Every player count, name bounds, shuffled roles/deck, initial knowledge, ready barrier                                | Room create/join, 5–10-player games, role reveal, readiness                       |
| Lobby             | Host permissions, minimum/maximum seats, guest/host leave, empty room closure                                         | Host transfer, session revocation, duplicate names, full/started rooms            |
| Elections         | Eligible/dead/self/term-limited targets, rotation, strict majority, tie, sealed/duplicate votes                       | Nomination/voting controls, simultaneous ballot conflicts, public results         |
| Legislation       | Private hand delivery, wrong actor/phase/index rejection, discard/enact, reshuffle, conservation                      | Both leaders’ controls, other players’ privacy, complete-game policy conservation |
| Executive powers  | All initial-player-count board slots, party-only investigation, no repeats, ordered peek, special rotation, execution | Each power exercised via browser, private intel, execution and special election   |
| Veto and chaos    | Unlock threshold, request/refusal/consent, failed-government tracker, third failure, cleared term limits              | Both veto responses via separate browsers, three rejected governments             |
| Victory           | Five Liberal policies, six Fascist policies, Hitler election and execution, role reveal                               | All four victory conditions, end screen and new-game control                      |
| Security/API      | Missing/forged auth, cross-origin POST, malformed body, stale version, bounded CAS retries, private projections       | Unauthorized/invalid requests, all simultaneous ballots accepted within one election; older-election ballots rejected                     |
| Storage           | Memory copies/expiry, Redis serialization/TTL, failure paths, missing Vercel credentials, CAS results                 | Real application HTTP calls through the Redis REST adapter to local test storage  |
| Browser lifecycle | Failed requests, reconnect, unmount, stale responses, leave/poll race, local-storage failure                          | Reload reconnect, session clearing, network interruption and recovery             |
| Presentation      | Every phase/actor UI, role envelope, clipboard, sound, dialog keyboard behavior                                       | Desktop/mobile overflow, theme persistence/system changes, keyboard focus trap    |

Confirmation checks cover cancelling, changing and deselecting cards, keyboard focus, phase-change dismissal, and passing only selected policies. Browser tests verify the phone popup and exercise confirmed nominations, votes, both policy stages, executive actions, and vetoes.

## Complete games

- The unit suite simulates **50 complete games** distributed across all supported player counts and checks that the 17 policy tiles are conserved after every transition.
- Six production E2E tests create rooms through the real API, join **5, 6, 7, 8, 9, and 10 players**, acknowledge roles, and play until a winner is declared. Every player’s response is checked for private-data leaks and policy conservation.
- A separate complete-game test uses **five independent browser contexts at phone and iPad sizes** and clicks nomination, ballots, legislation, executive actions, and role controls. Game progression uses real server requests, not intercepted game responses.
- Targeted late-game E2E scenarios seed test storage so every victory condition and rare phase can be checked reliably without depending on a lucky shuffle. The full-game scenarios start from ordinary room creation and use the application's real random setup.

## Storage boundary and reports

`tests/helpers/redis-server.mjs` is a loopback-only **test double** for the Redis REST service. It models room reads and atomic compare-and-set writes. The `/seed` helper exists only in this separate test process; the application has no test endpoints or privileged setup mode. These tests do **not** certify a live Upstash deployment or execute the Redis Lua scripts in an actual Redis runtime.

100% code coverage measures executed code paths, not all possible combinations of player choices, network timing, browsers, or hosting conditions. The matrix above defines the scenarios checked. Failures retain Playwright traces and screenshots in `test-results/`; the HTML report is in `playwright-report/`.

Regression checks cover ten concurrent same-election votes, private peek acknowledgement and reload, focused voting, action highlights, and distinct muted/unmuted audio cues.
