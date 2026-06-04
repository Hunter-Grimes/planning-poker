# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server with HMR
npm run build        # tsc (type-check, no emit) THEN vite build — type errors fail the build
npm run lint         # ESLint
npm run format       # Prettier write (format:check to verify only)
npm test             # Vitest, single run
npm run test:watch   # Vitest watch mode
npm run test:coverage

# Run a single test file or by name:
npx vitest run tests/domain/gameLogic.test.ts
npx vitest run -t "claims the room code"
```

`tsconfig` is `strict` with `noUnusedLocals`/`noUnusedParameters` — prefix an intentionally-unused binding with `_` (ESLint is configured to ignore that). CI (`.github/workflows/deploy.yml`) runs `npm test` on every push and PR to `main` and gates the GitHub Pages deploy on it.

## Architecture

A **serverless, P2P planning-poker app**: no backend — peers connect directly over WebRTC via [PeerJS](https://peerjs.com/), which uses the public broker only for the signaling handshake. The host's browser is the **single authoritative source** of game state and broadcasts redacted snapshots to guests. The bundle is fully static (GitHub Pages). See `README.md` for connectivity/TURN setup and the user-facing estimation flow.

### The layering rule (most important convention)

- **`src/domain/`** is pure: types, runtime validation guards, game reducers, color math. **No I/O, no React, no side effects.** This is where game rules live and why they're trivially testable.
- **`src/lib/`** is the I/O edge: `localStorage` (`storage.ts`), WebRTC/ICE config (`peerConfig.ts`), crypto (`hostIdentity.ts`), id/handle generation.
- **`src/hooks/`** wires the two together — `useRoom` is the whole networked engine.
- **`src/components/`** is `screens/` (top-level views `App` routes between) + `room/` (in-room feature pieces) + `ui/` (domain-agnostic primitives).

Most folders expose a barrel `index.ts`; import from the folder (`from '../room'`), not the individual file. Tests mirror the source tree under `tests/`.

### [`useRoom`](src/hooks/useRoom.ts) — the rotating-host engine

This single ~1100-line hook runs the entire room lifecycle. Its shape is deliberate:

- **One long-lived effect, one role machine** (`electing → host | guest`). The React component stays mounted while the underlying PeerJS `Peer` is torn down and rebuilt as the role changes. The effect re-runs only on `[roomCode, intent, pinnedPubKey]`, and is built to survive React 18 `<StrictMode>` dev double-mount (the `unavailable-id` retry in `startHostClaim`) — don't "fix" that retry away.
- **Per-role imperative API swapped via a ref.** Session state lives in *effect-local closures* (not React state) — `state`, `version`, connection maps, timers. The public callbacks (`vote`, `reveal`, …) are stable (`useCallback([])`) and delegate to `apiRef.current`, which the effect points at `hostApi`, `guestApi`, or `NOOP_API` as the role moves. To change behavior, mutate these closures and call the `setX` setters — **do not** add React state per role.
- The **current host always holds `Peer(roomCode)`** — the only address joiners know, so whoever claims that id on the broker *is* the host and everyone else connects as a guest.

### State sync & the wire protocol

All transitions are **pure reducers in [`gameLogic.ts`](src/domain/gameLogic.ts)**; the host calls them, commits (bumps a monotonic `version`), then broadcasts. Two sync mechanisms, both versioned:

- **`snapshot`** — full `GameState`, sent on join/resync and on *structural* changes (round/phase/component edits) where a delta would be fragile (`broadcastSnapshot`).
- **`StateDelta`** — minimal field updates for hot-path events (votes, joins, drops), each stamped `version + 1` (`emitDelta`). Guests apply via `applyDelta`; on a version gap (`raw.version !== version + 1`) they send `request-resync` and the host replies with a snapshot.

Three invariants you must preserve when touching networking:

1. **Validate everything inbound.** Every `PeerMessage` passes through `isPeerMessage` ([`validation.ts`](src/domain/validation.ts)) before it can touch state. Adding/changing a message type or a `GameState` field means updating the guard in lockstep.
2. **Redaction contract.** Before broadcasting, the host runs `redactForClient` so other players' votes stay hidden until reveal — each guest sees only their own `vote` plus a `hasVoted` flag. Use `playerHasVoted(player)` rather than checking `vote !== null`. Any new vote-adjacent state must respect this.
3. **Reducers stay pure.** Both host and guest run the same `gameLogic` functions; keep them side-effect-free so client and host can't drift.

### Host migration (the hard part)

- **Preferred vs temporary host.** The creator is the *preferred host* and holds an ECDSA P-256 keypair ([`hostIdentity.ts`](src/lib/hostIdentity.ts)). If the host drops, a pure deterministic `electHost` (smallest connected peer id) promotes a *temporary host*, who also claims the room code and restarts the round (redaction means an in-flight round can't be resumed losslessly). `migrationEpoch` bumps on every host change and is the monotonic epoch carried in the signed `claim-host` handoff — a stale claim (`epoch <= lastClaimEpoch`) is rejected as a replay.
- **Reclaim via signed handoff.** When the preferred host returns it sends a `claim-host` message signed over `${roomCode}|${epoch}|${nonce}`; the temp host verifies against the pinned public key, relays it so guests defer self-election, then steps down. The pubkey travels in the invite link's `#k=` fragment (fragments never reach the broker) or is pinned trust-on-first-use from the first snapshot.
- **A plain tab close ≠ Close Room.** `beforeunload`/`pagehide` sends `host-departing` (guests re-elect immediately) — the room migrates and lives on. The Close Room button sends the terminal `room-closed` and clears persistence.

### Identity, approval & graceful degradation

- The **raw client id never goes on the wire.** Each peer derives a per-room `handle = cyrb53(clientId | roomCode)` ([`storage.ts`](src/lib/storage.ts)) — stable per room, uncorrelatable across rooms. Approvals are keyed by handle and **distributed in `GameState.approvedHandles`**, so a promoted host auto-recognizes returning guests with no re-verification.
- **Crypto is never required.** SubtleCrypto needs a secure context, but the app deliberately supports plain-http intranets. Every crypto primitive degrades to `null` and falls back to a handle match plus a visible "host changed" warning (`migrationNotice`). Do not introduce a hard dependency on crypto, `crypto.subtle`, or HTTPS-only APIs in the connection path.

### Testing approach

- PeerJS is replaced with an in-memory fake — `vi.mock('peerjs', …)` → [`FakePeer`/`FakeConnection`](tests/helpers/peerMock.ts). Tests drive connections with the `fire*`/`receive` helpers and assert on `conn.sent`. Factories live in [`tests/helpers/factories.ts`](tests/helpers/factories.ts).
- The host throttles inbound messages per-type (`MIN_INTERVAL_MS`), so `useRoom` tests spy `Date.now()` to advance a fake clock between sends.
- `ui/` primitives and barrel `index.ts` files are excluded from coverage (exercised transitively).

## Environment / connectivity

ICE servers are configured in [`peerConfig.ts`](src/lib/peerConfig.ts): a STUN pool plus any static `VITE_TURN_*` build vars, optionally augmented at startup with TURN credentials fetched from `VITE_ICE_ENDPOINT` (Metered-style). The fetch is time-boxed and falls back to STUN-only, so same-network play always works. Set `VITE_PEER_DEBUG=3` to log the full signaling/ICE handshake. See README "Connectivity" for the full matrix.
