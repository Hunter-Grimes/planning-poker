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

## Deployment

The app is a static bundle. `npm run build` emits to `dist/`. It is configured
for GitHub Pages under the `/planning-poker/` path — see the `base` option in
[`vite.config.ts`](vite.config.ts) if you deploy elsewhere.
