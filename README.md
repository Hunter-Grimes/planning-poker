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

## How it works

- **Host vs. guest.** [`usePeerHost`](src/hooks/usePeerHost.ts) owns the room: it
  holds the authoritative `GameState`, approves/kicks players, and broadcasts
  state. [`usePeerClient`](src/hooks/usePeerClient.ts) connects a guest to the
  host and relays votes. [`App`](src/App.tsx) routes between the home, join, host,
  and guest screens and restores sessions from `localStorage`.
- **Authoritative state + redaction.** All game transitions are pure reducers in
  [`gameLogic.ts`](src/gameLogic.ts). Before broadcasting, the host calls
  `redactForClient` so other players' votes stay hidden until reveal (each guest
  still sees their own, plus a `hasVoted` flag).
- **Messages are validated.** Every inbound `PeerMessage` is checked with the
  runtime type guards in [`types.ts`](src/types.ts) before it can touch state.
- **Persistence.** [`storage.ts`](src/storage.ts) wraps `localStorage` for host
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
[`peerConfig.ts`](src/peerConfig.ts). The default is a STUN-only pool, which is
enough when at least one peer is directly reachable.

On restrictive networks — symmetric NAT, corporate firewalls, VPNs — STUN can't
punch through and a guest will reach the room but never connect ("Connecting…"
then an error). That case needs a **TURN relay**, supplied via build-time env
vars (e.g. in a `.env` file or your CI secrets):

```bash
VITE_TURN_URL=turn:turn.example.com:3478,turns:turn.example.com:5349
VITE_TURN_USERNAME=your-username
VITE_TURN_CREDENTIAL=your-credential
```

`VITE_TURN_URL` is comma-separated so one credential can advertise several
transports. Get credentials from a TURN provider (e.g. metered.ca, Twilio) or
self-host [coturn](https://github.com/coturn/coturn). Without TURN, strict-NAT
clients can't connect — there is no free reliable public relay to fall back on.

If a guest gets stuck connecting, it now fails with an error after ~15s instead
of hanging. To see exactly where the handshake breaks, set `VITE_PEER_DEBUG=3`
and watch the browser console — a stuck `iceConnectionState` of `checking` or a
`failed` state means the network is blocking peer-to-peer traffic (common with
Wi-Fi "client isolation" / guest networks), which is what TURN is for.

## Deployment

The app is a static bundle. `npm run build` emits to `dist/`. It is configured
for GitHub Pages under the `/planning-poker/` path — see the `base` option in
[`vite.config.ts`](vite.config.ts) if you deploy elsewhere. To enable TURN in a
GitHub Pages build, set the `VITE_TURN_*` values as repository secrets and pass
them as env to the `npm run build` step in [`deploy.yml`](.github/workflows/deploy.yml).
