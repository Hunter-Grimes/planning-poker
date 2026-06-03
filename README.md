# Planning Poker

A lightweight, serverless [planning poker](https://en.wikipedia.org/wiki/Planning_poker)
app for agile estimation. One person hosts a room, others join with a 6-character
code, everyone votes on a Fibonacci deck, and the host reveals the results.

There is **no backend** — peers connect directly over WebRTC via
[PeerJS](https://peerjs.com/), using the public PeerJS broker only for the
initial signaling handshake. The host's browser is the authoritative source of
game state and broadcasts redacted snapshots to each guest.

## Getting started

```bash
npm install
npm run dev        # start the Vite dev server
```

Then open the printed URL. To play across machines, share the room code (or the
`?room=CODE` invite link) shown in the host's header.

## Scripts

| Command                 | Description                                                        |
| ----------------------- | ------------------------------------------------------------------ |
| `npm run dev`           | Start the dev server with HMR.                                     |
| `npm run build`         | Type-check (`tsc`) and produce a production build.                 |
| `npm run preview`       | Serve the production build locally.                                |
| `npm run lint`          | Run ESLint.                                                        |
| `npm run format`        | Format the codebase with Prettier (`format:check` to verify only). |
| `npm test`              | Run the Vitest suite once.                                         |
| `npm run test:watch`    | Run tests in watch mode.                                           |
| `npm run test:coverage` | Run tests with a V8 coverage report.                               |

## Project structure

```
src/
  app/          App bootstrap — root component, screen routing, render entry (main.tsx)
  domain/       Pure model + rules (no I/O): types, validation guards, gameLogic reducers, cardColors
  lib/          Side-effecting utilities: storage (localStorage), peerConfig (ICE/WebRTC), id, cn
  hooks/        React hooks: usePeerHost, usePeerClient, useTheme
  components/
    screens/    Top-level views App routes to: Home, Join, HostRoom, GuestRoom
    room/        In-room feature pieces: CardDeck, PlayerList, ResultsView, ComponentList, …
    ui/          Reusable, domain-agnostic primitives: Button, Input, Surface, ThemeToggle, tokens
  styles/       Global CSS
tests/          Vitest suite, mirroring the source tree (+ helpers/ for factories and the PeerJS mock)
```

The key boundary is `domain/` (pure, trivially testable) versus `lib/` (the I/O
edge). Most folders expose a barrel `index.ts` so callers import from the folder
(e.g. `from '../room'`) rather than reaching into individual files.

## How it works

- **Host vs. guest.** [`usePeerHost`](src/hooks/usePeerHost.ts) owns the room: it
  holds the authoritative `GameState`, approves/kicks players, and broadcasts
  state. [`usePeerClient`](src/hooks/usePeerClient.ts) connects a guest to the
  host and relays votes. [`App`](src/app/App.tsx) routes between the home, join,
  host, and guest screens and restores sessions from `localStorage`.
- **Authoritative state + redaction.** All game transitions are pure reducers in
  [`gameLogic.ts`](src/domain/gameLogic.ts). Before broadcasting, the host calls
  `redactForClient` so other players' votes stay hidden until reveal (each guest
  still sees their own, plus a `hasVoted` flag).
- **Messages are validated.** Every inbound `PeerMessage` is checked with the
  runtime type guards in [`validation.ts`](src/domain/validation.ts) before it can
  touch state.
- **Persistence.** [`storage.ts`](src/lib/storage.ts) wraps `localStorage` for host
  and guest session restore and for the in-progress story backlog.

## Estimation flow

The host adds "components" (stories) to a backlog, the room votes on the active
one, the host reveals (consensus triggers confetti 🎉), then advances to the next
component. When every component is estimated the room shows an **Estimate
Summary** with the per-component averages and a total. "New Ticket" resets the
averages to start a fresh round of estimation.

## Connectivity (STUN / TURN)

Peers find each other through the public PeerJS broker, then open a direct
WebRTC data channel. Traversing NAT needs ICE servers, configured in
[`peerConfig.ts`](src/lib/peerConfig.ts). The default is a STUN-only pool, which is
enough when at least one peer is directly reachable.

On restrictive networks — symmetric NAT, corporate firewalls, VPNs, mobile data —
STUN can't punch through and a guest will reach the room but never connect
("Connecting…" then an error after ~15s). That case needs a **TURN relay**.

### TURN via Metered (recommended)

At startup the app fetches ICE servers from `VITE_ICE_ENDPOINT` (when set) and
merges them with the STUN pool. Point it at [Metered](https://www.metered.ca/)'s
front-end-safe credentials URL — the `apiKey` there is designed to be embedded
in the client:

```bash
VITE_ICE_ENDPOINT=https://<your-app>.metered.live/api/v1/turn/credentials?apiKey=<your-api-key>
```

The fetch is time-boxed (~3s) and falls back to STUN-only if the endpoint is
unreachable, so play on the same network keeps working regardless. The endpoint
may return Metered's bare array or a `{ "iceServers": [...] }` object — both are
accepted, so a custom credential service works too.

### TURN via static credentials (alternative)

If you have a fixed relay (your own [coturn](https://github.com/coturn/coturn),
Twilio, etc.) you can hard-wire it instead of / in addition to the endpoint:

```bash
VITE_TURN_URL=turn:turn.example.com:3478,turns:turn.example.com:5349
VITE_TURN_USERNAME=your-username
VITE_TURN_CREDENTIAL=your-credential
```

`VITE_TURN_URL` is comma-separated so one credential can advertise several
transports.

If a guest gets stuck connecting, it now fails with an error after ~15s instead
of hanging. To see exactly where the handshake breaks, set `VITE_PEER_DEBUG=3`
and watch the browser console — a stuck `iceConnectionState` of `checking` or a
`failed` state means the network is blocking peer-to-peer traffic (common with
Wi-Fi "client isolation" / guest networks), which is what TURN is for.

## Deployment

The app is a static bundle. `npm run build` emits to `dist/`. It is configured
for GitHub Pages under the `/planning-poker/` path — see the `base` option in
[`vite.config.ts`](vite.config.ts) if you deploy elsewhere. To enable TURN in a
GitHub Pages build, set `VITE_ICE_ENDPOINT` (a repository **variable** is fine —
Metered's `apiKey` is front-end-safe) and pass it as env to the `npm run build`
step in [`deploy.yml`](.github/workflows/deploy.yml).
