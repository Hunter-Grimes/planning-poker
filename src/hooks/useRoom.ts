import { useCallback, useEffect, useRef, useState } from 'react';
import Peer, { DataConnection } from 'peerjs';
import {
  CardValue,
  Component,
  GameState,
  MAX_COMPONENT_LABEL_LENGTH,
  MAX_PLAYERS,
  PeerMessage,
  PendingEntry,
  Player,
  PreferredHost,
  StateDeltaBody,
} from '../domain/types';
import { isPeerMessage } from '../domain/validation';
import * as game from '../domain/gameLogic';
import { applyDelta } from '../domain/gameLogic';
import { getPeerConfig } from '../lib/peerConfig';
import { storage } from '../lib/storage';
import { createHostKeypair, cryptoAvailable, randomNonce, signClaim, verifyClaim } from '../lib/hostIdentity';
import { log as ppLogEvent } from '../lib/logger';

export type ConnectionStatus = 'connecting' | 'pending' | 'connected' | 'disconnected' | 'error';
export type RoomRole = 'electing' | 'host' | 'guest';
export type RoomIntent = 'create' | 'join';

export interface UseRoomReturn {
  role: RoomRole;
  isPreferredHost: boolean;
  roomCode: string;
  myId: string | null;
  gameState: GameState | null;
  status: ConnectionStatus;
  stalled: boolean;
  pendingPlayers: PendingEntry[];
  error: string | null;
  // A human-readable warning shown when control migrated without a verifiable
  // signature (degraded / plain-http path). null when nothing to flag.
  migrationNotice: string | null;
  vote: (value: CardValue) => void;
  signalActive: () => void;
  reveal: () => void;
  newRound: () => void;
  restartRound: () => void;
  approvePlayer: (peerId: string) => void;
  denyPlayer: (peerId: string) => void;
  kickPlayer: (peerId: string) => void;
  addComponent: (label: string) => void;
  removeComponent: (id: string) => void;
  toggleComponent: (id: string) => void;
  renameComponent: (id: string, label: string) => void;
  nextComponent: () => void;
  newTicket: () => void;
  closeRoom: () => void;
}

const ATTEMPT_TIMEOUT_MS = 15000;
const STALL_THRESHOLD_MS = 20000;
const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;
// After this many failed reconnects a non-elected guest escalates to claiming
// the host slot itself, so a dead election winner can't strand the room.
const ESCALATE_AFTER_ATTEMPTS = 3;
// How long a verified takeover suppresses self-election so only the preferred
// host reclaims the room code. Must comfortably exceed the reclaim retry budget
// in `startHostClaim` (its reclaiming MAX_UNAVAILABLE × UNAVAILABLE_RETRY_MS):
// the temp host yields the code and defers for this long, and the returning host
// needs that whole window to ride out the broker's TTL on the just-freed id and
// grab it — else the temp host re-elects mid-reclaim and the handoff never lands.
const DEFER_ELECTION_MS = 12000;
// When the host announces it's closing its tab, guests re-elect at once. The
// election winner claims the room code immediately; everyone else waits this
// brief head start (and reconnects on this snappy cadence) so the new host has
// claimed the code before they try to reach it — avoids a burst of
// peer-unavailable retries against an id nobody holds yet.
const HOST_HANDOFF_GRACE_MS = 600;
const MIN_INTERVAL_MS = 50;
// PeerJS error types that are recoverable: a dropped/closed broker socket or a
// transient network error. PeerJS keeps the peer alive on these and our
// `disconnected` handler reconnects, and P2P data channels survive a broker
// blip — so tearing the room down (terminate) would strand a host that just
// briefly lost the signaling server. Anything NOT listed here (bad id/key,
// unsupported browser) is genuinely fatal and still terminates.
const RECOVERABLE_PEER_ERRORS = new Set([
  'network',
  'disconnected',
  'server-error',
  'socket-error',
  'socket-closed',
]);

interface ApiImpl {
  vote: (value: CardValue) => void;
  signalActive: () => void;
  reveal: () => void;
  newRound: () => void;
  restartRound: () => void;
  approvePlayer: (peerId: string) => void;
  denyPlayer: (peerId: string) => void;
  kickPlayer: (peerId: string) => void;
  addComponent: (label: string) => void;
  removeComponent: (id: string) => void;
  toggleComponent: (id: string) => void;
  renameComponent: (id: string, label: string) => void;
  nextComponent: () => void;
  newTicket: () => void;
  closeRoom: () => void;
}

const NOOP_API: ApiImpl = {
  vote: () => {},
  signalActive: () => {},
  reveal: () => {},
  newRound: () => {},
  restartRound: () => {},
  approvePlayer: () => {},
  denyPlayer: () => {},
  kickPlayer: () => {},
  addComponent: () => {},
  removeComponent: () => {},
  toggleComponent: () => {},
  renameComponent: () => {},
  nextComponent: () => {},
  newTicket: () => {},
  closeRoom: () => {},
};

export interface UseRoomOptions {
  roomCode: string;
  playerName: string;
  intent: RoomIntent;
  // Preferred-host public key pinned from the invite-link fragment, if present.
  pinnedPubKey?: string | null;
}

/**
 * One hook for the whole room lifecycle with a rotating host. A single React
 * component stays mounted while the underlying PeerJS peer is swapped as the
 * role changes (electing → host | guest). The *current* host always holds
 * `Peer(roomCode)` so new joiners can always reach it; a promoted temporary
 * host claims the room code, and the original ("preferred") host reclaims it via
 * a signed handoff when it returns.
 */
export function useRoom({
  roomCode,
  playerName,
  intent,
  pinnedPubKey = null,
}: UseRoomOptions): UseRoomReturn {
  const [role, setRole] = useState<RoomRole>('electing');
  const [isPreferredHost, setIsPreferredHost] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [stalled, setStalled] = useState(false);
  const [pendingPlayers, setPendingPlayers] = useState<PendingEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [migrationNotice, setMigrationNotice] = useState<string | null>(null);

  // Imperative API for the current role; the effect swaps this as the role
  // changes, and the public callbacks below delegate to it.
  const apiRef = useRef<ApiImpl>(NOOP_API);

  // Props read inside the long-lived effect without re-running it.
  const nameRef = useRef(playerName);
  nameRef.current = playerName;

  useEffect(() => {
    let disposed = false;

    // ---- shared session state -------------------------------------------
    let peer: Peer | null = null;
    let myPeerId: string | null = null;
    // The random peer id we last used as a guest — needed to drop our own stale
    // entry from the player list when we promote to host (where our id becomes
    // the room code).
    let myGuestId: string | null = null;
    // Effect-local mirror of `role` (the useState closure is frozen at 'electing').
    let curRole: RoomRole = 'electing';
    const setCurRole = (r: RoomRole) => {
      const prev = curRole;
      curRole = r;
      if (!disposed) setRole(r);
      if (prev !== r) dlog('role', { from: prev, to: r });
    };
    const myHandle = storage.getRoomHandle(roomCode);
    let hostKey = storage.getHostKey(roomCode); // preferred-host keypair (creator only)
    // We are the preferred host iff we created this room. Detected robustly so a
    // returning creator is recognised however they re-enter: by intent, by still
    // holding the room's keypair, or by a saved host session for this exact room.
    // Without this, a creator who reconnects via an invite link (intent 'join')
    // would be a permanent guest and never reclaim.
    const isPreferred = () =>
      intent === 'create' || hostKey !== null || storage.getHost()?.roomCode === roomCode;
    let amPreferred = isPreferred();
    // Pinned preferred-host identity: invite-link fragment first, then whatever
    // we persisted on a prior visit (survives a full restart), else learned from
    // the first snapshot (trust-on-first-use).
    let pinnedPreferred: PreferredHost | null = pinnedPubKey
      ? { handle: '', pubKey: pinnedPubKey }
      : storage.getPreferredHost(roomCode);

    // Authoritative (host) or last-known (guest) state.
    let state: GameState | null = null;
    let version = 0;

    // host runtime
    const connections = new Map<string, DataConnection>();
    const pendingConns = new Map<string, DataConnection>();
    const pendingData = new Map<string, PendingEntry>();
    const peerToHandle = new Map<string, string>();
    let approved: Set<string> = new Set();
    // True while teardownPeer() is deliberately closing our own connections (a
    // role change / step-down), so their synchronous 'close' handlers don't fire
    // player-disconnected deltas that would corrupt the roster we keep showing
    // until we re-sync as the new role.
    let tearingDown = false;

    // guest runtime
    let hostConn: DataConnection | null = null;
    let synced = false;

    // election / reconnect
    let attemptTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    let deferTimer: ReturnType<typeof setTimeout> | undefined;
    let backoff = RECONNECT_BASE_MS;
    let failedAttempts = 0;
    let deferElection = false;
    let claimSent = false;
    let lastClaimEpoch = -1;
    // Announce-on-close guard: send `host-departing` at most once, and never
    // after an explicit closeRoom() (which sends the terminal `room-closed`).
    let departed = false;
    let roomClosed = false;

    // Short id distinguishing this hook instance in the logs (e.g. StrictMode's
    // double-mount, or before we have a peer id). Diagnostic only.
    const SID = Math.random().toString(36).slice(2, 6);
    // Emit a diagnostic event stamped with the current room state. No-op unless
    // debug logging is enabled (see lib/logger.ts). This is how we trace a "host
    // returns but the room is dead" report from the field.
    const dlog = (event: string, extra?: Record<string, unknown>) =>
      ppLogEvent('room', event, {
        sid: SID,
        role: curRole,
        pref: amPreferred,
        claimSent,
        me: myPeerId,
        host: state ? state.hostId : null,
        epoch: state ? state.migrationEpoch : undefined,
        conns: connections.size,
        failed: failedAttempts,
        defer: deferElection,
        lastClaim: lastClaimEpoch,
        ...extra,
      });

    const clear = (t: ReturnType<typeof setTimeout> | undefined) => {
      if (t !== undefined) clearTimeout(t);
    };
    const stopTimers = () => {
      clear(attemptTimer);
      clear(retryTimer);
      clear(stallTimer);
      attemptTimer = retryTimer = stallTimer = undefined;
    };
    const startStallTimer = () => {
      if (stallTimer !== undefined) return;
      stallTimer = setTimeout(() => {
        if (!disposed) setStalled(true);
      }, STALL_THRESHOLD_MS);
    };
    const stopStallTimer = () => {
      clear(stallTimer);
      stallTimer = undefined;
      if (!disposed) setStalled(false);
    };

    // ---- host helpers ----------------------------------------------------
    const commit = (next: GameState): number => {
      state = next;
      version += 1;
      if (!disposed) setGameState(next);
      return version;
    };
    const snapshotFor = (peerId: string, v: number): PeerMessage => ({
      type: 'snapshot',
      version: v,
      state: game.redactForClient(state as GameState, peerId),
    });
    const broadcastSnapshot = (updater: (prev: GameState) => GameState) => {
      const next = updater(state as GameState);
      const v = commit(next);
      connections.forEach((conn, peerId) => {
        if (conn.open) conn.send(snapshotFor(peerId, v));
      });
    };
    const emitDelta = (
      updater: (prev: GameState) => GameState,
      makeDelta: (next: GameState) => StateDeltaBody,
      exceptPeerId?: string,
    ) => {
      const next = updater(state as GameState);
      const v = commit(next);
      const msg = { ...makeDelta(next), version: v } as PeerMessage;
      connections.forEach((conn, peerId) => {
        if (peerId === exceptPeerId) return;
        if (conn.open) conn.send(msg);
      });
    };
    // Persist approvals only for the preferred host (so a restart keeps them).
    const persistApproval = (handle: string, name: string) => {
      if (!amPreferred) return;
      storage.addApprovedHandle(handle, name);
    };

    const doApprove = (
      conn: DataConnection,
      peerId: string,
      handle: string,
      name: string,
    ) => {
      const prior = connections.get(peerId);
      if (prior && prior !== conn) {
        try {
          prior.close();
        } catch {
          /* best-effort */
        }
      }
      connections.set(peerId, conn);
      peerToHandle.set(peerId, handle);
      approved.add(handle);
      if (conn.open) conn.send({ type: 'approved' } satisfies PeerMessage);

      const newPlayer: Player = { id: peerId, name, vote: null, connected: true };
      const nextApproved = { ...(state as GameState).approvedHandles, [handle]: name };
      const next: GameState = {
        ...(state as GameState),
        approvedHandles: nextApproved,
        players: [...(state as GameState).players.filter((p) => p.id !== peerId), newPlayer],
      };
      const v = commit(next);
      if (conn.open) conn.send(snapshotFor(peerId, v));
      const joinedMsg: PeerMessage = {
        type: 'player-joined',
        version: v,
        player: { ...newPlayer, hasVoted: false },
      };
      connections.forEach((other, otherId) => {
        if (otherId === peerId) return;
        if (other.open) other.send(joinedMsg);
      });
      persistApproval(handle, name);
    };

    const refreshPending = () => {
      if (!disposed) setPendingPlayers([...pendingData.values()]);
    };

    // ---- preferred-host handoff -----------------------------------------
    const effectivePreferred = (): PreferredHost | null =>
      pinnedPreferred ?? (state ? state.preferredHost : null);

    // Validate an incoming takeover claim. ok → accept; verified=false → warn.
    const validateClaim = async (
      msg: Extract<PeerMessage, { type: 'claim-host' }>,
    ): Promise<{ ok: boolean; verified: boolean }> => {
      const pref = effectivePreferred();
      if (!pref) {
        dlog('claim:reject', { reason: 'no-preferred-known', epoch: msg.epoch });
        return { ok: false, verified: false };
      }
      if (msg.epoch <= lastClaimEpoch) {
        dlog('claim:reject', { reason: 'stale-epoch', epoch: msg.epoch, lastClaim: lastClaimEpoch });
        return { ok: false, verified: false };
      }
      if (pref.pubKey) {
        if (!msg.sig) {
          dlog('claim:reject', { reason: 'no-sig', epoch: msg.epoch });
          return { ok: false, verified: false };
        }
        const ok = await verifyClaim(pref.pubKey, msg.sig, roomCode, msg.epoch, msg.nonce);
        dlog(ok ? 'claim:verify-ok' : 'claim:reject', {
          reason: ok ? undefined : 'verify-false',
          epoch: msg.epoch,
          claimHandle: msg.handle,
          prefHandle: pref.handle,
        });
        return { ok, verified: ok };
      }
      // Degraded: no pinned key — accept a handle match but flag it.
      const ok = msg.handle === pref.handle;
      dlog(ok ? 'claim:handle-ok' : 'claim:reject', {
        reason: ok ? undefined : 'handle-mismatch',
        epoch: msg.epoch,
        claimHandle: msg.handle,
        prefHandle: pref.handle,
      });
      return { ok, verified: false };
    };

    const beginDefer = () => {
      deferElection = true;
      clear(deferTimer);
      deferTimer = setTimeout(() => {
        deferElection = false;
      }, DEFER_ELECTION_MS);
    };

    // Host received a takeover claim: if valid, relay it so peers defer, then
    // step down to a guest so the preferred host can reclaim the room code.
    const onHostReceivedClaim = async (msg: Extract<PeerMessage, { type: 'claim-host' }>) => {
      dlog('claim:host-recv', { epoch: msg.epoch, claimHandle: msg.handle, hasSig: !!msg.sig });
      if (curRole !== 'host' || amPreferred) {
        dlog('claim:host-ignore', { reason: curRole !== 'host' ? 'not-host' : 'am-preferred' });
        return;
      }
      const { ok, verified } = await validateClaim(msg);
      if (disposed || !ok) return;
      lastClaimEpoch = msg.epoch;
      if (!verified && !disposed) {
        setMigrationNotice('Host changed — verify this is expected.');
      }
      connections.forEach((conn) => {
        if (conn.open) conn.send(msg);
      });
      dlog('claim:stepdown', { epoch: msg.epoch, verified, relayedTo: connections.size });
      beginDefer();
      // Yield: tear down the host peer and rejoin as a guest pointing at the
      // room code, where the preferred host will appear.
      teardownPeer();
      startGuest();
    };

    // A guest saw a (relayed) takeover claim: defer self-election so the
    // preferred host wins the room code uncontested.
    const onGuestSawClaim = async (msg: Extract<PeerMessage, { type: 'claim-host' }>) => {
      const { ok, verified } = await validateClaim(msg);
      if (disposed || !ok) return;
      lastClaimEpoch = msg.epoch;
      if (!verified) setMigrationNotice('Host changed — verify this is expected.');
      dlog('claim:guest-defer', { epoch: msg.epoch });
      beginDefer();
    };

    // The host announced it's closing its tab. Re-elect a new host *now* rather
    // than waiting out the multi-second WebRTC connection timeout: the election
    // winner claims the room code immediately, everyone else reconnects to it
    // after a short head start. Falls through to the normal reconnect/backoff
    // path if the winner never shows (e.g. it was the one that just left).
    const onHostDeparting = () => {
      if (disposed || curRole !== 'guest') return;
      synced = false;
      stopTimers();
      if (!disposed) setStatus('connecting');
      // Snappy reconnect cadence for the brief handoff window.
      backoff = HOST_HANDOFF_GRACE_MS;
      const winner = state ? game.electHost(state) : null;
      dlog('host-departing', { winner: winner?.id ?? null, iWin: !!(winner && winner.id === myPeerId) });
      if (winner && myPeerId && winner.id === myPeerId) {
        attempt(); // I'm the new host — claim the room code at once.
        return;
      }
      startStallTimer();
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        attempt();
      }, HOST_HANDOFF_GRACE_MS);
    };

    // ---- data handlers ---------------------------------------------------
    const handleHostData = (conn: DataConnection, raw: unknown) => {
      if (!isPeerMessage(raw)) return;
      if (raw.type === 'request-join') {
        const peerId = conn.peer;
        const { name, handle } = raw;
        if (
          game.isNameTaken(
            (state as GameState).players,
            peerToHandle,
            [...pendingData.values()].map((e) => ({ persistentId: e.persistentId, name: e.name })),
            handle,
            name,
          )
        ) {
          if (conn.open) {
            conn.send({
              type: 'rejected',
              reason: 'That name is already in use. Please choose another.',
            } satisfies PeerMessage);
            setTimeout(() => conn.close(), 200);
          }
          return;
        }
        // Auto-approve previously-approved handles, and always the preferred
        // host — recognised by its known handle even on a temp host that started
        // from scratch (no carried approvals). Without this the returning creator
        // is stuck in the join queue, never gets a snapshot, and so never sends
        // its takeover claim.
        const prefHandle = effectivePreferred()?.handle;
        const isPref = handle !== '' && handle === prefHandle;
        if (approved.has(handle) || isPref) {
          dlog('join:approve', { handle, name, viaPreferred: isPref && !approved.has(handle) });
          doApprove(conn, peerId, handle, name);
          return;
        }
        dlog('join:pending', { handle, name, prefHandle });
        const entry: PendingEntry = { id: peerId, name, persistentId: handle };
        pendingConns.set(peerId, conn);
        pendingData.set(peerId, entry);
        refreshPending();
        return;
      }

      if (raw.type === 'vote') {
        if ((state as GameState).revealed || (state as GameState).phase !== 'voting') return;
        if (connections.get(conn.peer) !== conn) return;
        const existing = (state as GameState).players.find((p) => p.id === conn.peer);
        if (existing && existing.vote === raw.value) return;
        emitDelta(
          (prev) => game.castVote(prev, conn.peer, raw.value),
          () => ({ type: 'voted', id: conn.peer }),
        );
        return;
      }

      if (raw.type === 'active') {
        if ((state as GameState).revealed || (state as GameState).phase !== 'voting') return;
        if (connections.get(conn.peer) !== conn) return;
        const existing = (state as GameState).players.find((p) => p.id === conn.peer);
        if (!existing || existing.active) return;
        emitDelta(
          (prev) => game.setActive(prev, conn.peer),
          () => ({ type: 'player-active', id: conn.peer }),
        );
        return;
      }

      if (raw.type === 'request-resync') {
        if (connections.get(conn.peer) !== conn) return;
        if (conn.open) conn.send(snapshotFor(conn.peer, version));
        return;
      }

      if (raw.type === 'claim-host') {
        void onHostReceivedClaim(raw);
        return;
      }
    };

    const handleGuestData = (conn: DataConnection, raw: unknown) => {
      if (conn !== hostConn) return;
      if (!isPeerMessage(raw)) return;
      switch (raw.type) {
        case 'approved':
          if (!disposed) setStatus('connected');
          maybeSendClaim();
          return;
        case 'rejected':
          terminate(raw.reason);
          return;
        case 'room-closed':
          terminate('The host closed the room.');
          return;
        case 'host-departing':
          onHostDeparting();
          return;
        case 'claim-host':
          void onGuestSawClaim(raw);
          return;
        case 'snapshot':
          version = raw.version;
          synced = true;
          state = raw.state;
          // Pin the preferred host the first time we learn it (trust-on-first-use)
          // and remember it across restarts, so if we later become a temporary
          // host we can still verify and yield to the real creator's return.
          if (raw.state.preferredHost) {
            if (!pinnedPreferred) pinnedPreferred = raw.state.preferredHost;
            storage.savePreferredHost(roomCode, raw.state.preferredHost);
          }
          dlog('snapshot', {
            v: raw.version,
            host: raw.state.hostId,
            epoch: raw.state.migrationEpoch,
            prefHandle: raw.state.preferredHost?.handle,
            prefHasKey: !!raw.state.preferredHost?.pubKey,
            players: raw.state.players.length,
          });
          if (!disposed) setGameState(raw.state);
          maybeSendClaim();
          return;
        case 'voted':
        case 'unvoted':
        case 'player-active':
        case 'reveal':
        case 'player-joined':
        case 'player-disconnected':
        case 'player-removed': {
          if (!synced || raw.version !== version + 1) {
            if (conn.open) conn.send({ type: 'request-resync' } satisfies PeerMessage);
            return;
          }
          version = raw.version;
          state = state ? applyDelta(state, raw) : state;
          if (!disposed && state) setGameState(state);
          return;
        }
      }
    };

    // A returning preferred host, once connected as a guest to someone else's
    // room, asks for control back.
    const maybeSendClaim = () => {
      if (claimSent || curRole !== 'guest' || !amPreferred || !state) {
        dlog('claim:skip', {
          reason: claimSent
            ? 'already-sent'
            : curRole !== 'guest'
              ? 'not-guest'
              : !amPreferred
                ? 'not-preferred'
                : 'no-state',
        });
        return;
      }
      if (state.hostId === myPeerId) {
        dlog('claim:skip', { reason: 'already-host' });
        return; // already hosting (shouldn't happen as guest)
      }
      // A key-protected room can only be reclaimed by signing with the matching
      // private key, so without it we can't prove identity — don't claim. A room
      // created without crypto authenticates the takeover by handle match, so a
      // returning preferred host that never had a keypair can (and must) still
      // claim with sig: null.
      const pref = effectivePreferred();
      if (pref?.pubKey && !hostKey) {
        dlog('claim:skip', { reason: 'no-hostkey-for-keyed-room', hasCrypto: cryptoAvailable() });
        return;
      }
      claimSent = true;
      const epoch = state.migrationEpoch + 1;
      const nonce = randomNonce();
      dlog('claim:send-begin', { epoch, willSign: !!hostKey, hasPubKey: !!pref?.pubKey });
      const signed = hostKey
        ? signClaim(hostKey.privJwk, roomCode, epoch, nonce)
        : Promise.resolve<string | null>(null);
      void signed
        .then((sig) => {
          if (hostKey && !sig) dlog('claim:sign-null', { epoch }); // signing unexpectedly failed
          if (disposed || !hostConn || !hostConn.open) {
            dlog('claim:send-abort', { epoch, disposed, hostConnOpen: !!hostConn?.open });
            return;
          }
          hostConn.send({ type: 'claim-host', handle: myHandle, epoch, nonce, sig } satisfies PeerMessage);
          dlog('claim:sent', { epoch, hasSig: !!sig });
        })
        .catch((e) => dlog('claim:sign-error', { epoch, error: String(e) }));
    };

    // ---- peer lifecycle --------------------------------------------------
    const teardownPeer = () => {
      if (peer || connections.size) dlog('teardown', { conns: connections.size, hadPeer: !!peer });
      stopTimers();
      tearingDown = true;
      connections.forEach((c) => {
        try {
          c.close();
        } catch {
          /* best-effort */
        }
      });
      connections.clear();
      pendingConns.clear();
      pendingData.clear();
      peerToHandle.clear();
      if (!disposed) setPendingPlayers([]);
      hostConn = null;
      synced = false;
      if (peer) {
        try {
          peer.destroy();
        } catch {
          /* best-effort */
        }
      }
      peer = null;
      tearingDown = false;
    };

    const scheduleReconnect = () => {
      if (disposed || retryTimer !== undefined) return;
      clear(attemptTimer);
      attemptTimer = undefined;
      if (!disposed) setStatus('connecting');
      startStallTimer();
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        attempt();
      }, backoff);
      backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
    };

    // Decide whether THIS peer should claim the host slot on the next attempt.
    const shouldClaimHost = (): boolean => {
      if (amPreferred) {
        // The preferred host always (re)takes the room. If a reachable temp host
        // holds the code we grab it anyway — that collides to unavailable-id and
        // we fall through to the guest handshake, which makes the temp host step
        // down. If the code is headless we take it immediately rather than
        // waiting out the ordinary escalation delay. There is no time limit:
        // however long we've been gone, returning means reclaiming.
        return true;
      }
      if (deferElection) return false;
      // Escalation: nobody is reachable on the room code and we've waited — claim
      // it so a dead election winner (or an empty room everyone restarted into)
      // can't strand things. Checked before the no-state case so a guest that
      // restarted with no snapshot can still become a temporary host.
      if (failedAttempts >= ESCALATE_AFTER_ATTEMPTS) return true;
      if (!state) return intent === 'create';
      const winner = game.electHost(state);
      return !!(winner && myPeerId && winner.id === myPeerId);
    };

    const attempt = () => {
      if (disposed) return;
      teardownPeer();
      const claim = shouldClaimHost();
      dlog('attempt', { willClaim: claim });
      if (claim) startHostClaim();
      else startGuest();
    };

    // Claim `Peer(roomCode)` to become host. Success → host; collision → guest.
    const startHostClaim = () => {
      if (disposed) return;
      setCurRole('electing');
      if (!disposed) setStatus('connecting');
      startStallTimer();
      let unavailableRetries = 0;
      // Ride out the broker's TTL on a just-released id before concluding that
      // someone else really holds it. Two budgets, by why we're claiming:
      //   - Reclaiming (we're the preferred host and our signed claim was
      //     acknowledged): the temp host has yielded the code and is deferring
      //     self-election for DEFER_ELECTION_MS, so for that whole window we're
      //     the *only* peer racing for the freed id — and the public broker can
      //     sit on it for several seconds after the temp host's peer is
      //     destroyed. Keep trying until just shy of the defer window so we win
      //     the instant it frees. Falling back to a guest here strands the room
      //     headless until the temp host re-elects — exactly the "old host
      //     reconnects but never regains control" bug.
      //   - Fresh claim (initial create, an elected winner, or a StrictMode dev
      //     double-mount): we only briefly probe a code someone else may
      //     legitimately hold, then join them as a guest to do the signed
      //     handshake. A short budget keeps that failover snappy.
      const reclaiming = amPreferred && claimSent;
      const UNAVAILABLE_RETRY_MS = 500;
      const MAX_UNAVAILABLE = reclaiming ? 20 : 6; // ~10s vs ~3s

      const build = () => {
        const p = new Peer(roomCode, getPeerConfig());
        peer = p;
        p.on('open', (id) => {
          if (disposed) return;
          myPeerId = id;
          // A second `open` on a peer we're already hosting on is a broker
          // reconnect after a transient drop — we still hold the room code and
          // our P2P links survived. Resume; do NOT re-seed state (that would
          // reset the round and mark still-connected guests as disconnected).
          if (curRole === 'host' && state) {
            dlog('host:peer-reopen', { id });
            backoff = RECONNECT_BASE_MS;
            stopStallTimer();
            if (!disposed) setStatus('connected');
            return;
          }
          dlog('host:peer-open', { id });
          becomeHost();
        });
        p.on('connection', (conn) => onHostConnection(conn));
        p.on('error', (err) => {
          const type = (err as { type?: string }).type;
          if (type === 'unavailable-id') {
            try {
              p.destroy();
            } catch {
              /* best-effort */
            }
            if (peer === p) peer = null;
            if (unavailableRetries < MAX_UNAVAILABLE) {
              unavailableRetries++;
              dlog('host:unavailable-id', { retry: unavailableRetries, max: MAX_UNAVAILABLE, reclaiming });
              setTimeout(build, UNAVAILABLE_RETRY_MS);
              return;
            }
            // Someone else holds the room code — join them as a guest instead.
            dlog('host:claim-giveup', { reclaiming, afterRetries: unavailableRetries });
            claimSent = false;
            teardownPeer();
            startGuest();
            return;
          }
          if (type === 'peer-unavailable') return; // a specific peer; ignore
          // Lost the signaling server, not the room: keep our live P2P links and
          // let the `disconnected` handler reconnect. Don't strand the host on
          // an error screen for a blip it will recover from on its own.
          if (type && RECOVERABLE_PEER_ERRORS.has(type)) {
            dlog('host:peer-error-recoverable', { type });
            return;
          }
          dlog('host:peer-error-fatal', { type, msg: err.message });
          terminate(err.message);
        });
        p.on('disconnected', () => {
          if (!p.destroyed) {
            try {
              p.reconnect();
            } catch {
              /* best-effort */
            }
          }
        });
      };
      build();
    };

    const becomeHost = () => {
      stopStallTimer();
      backoff = RECONNECT_BASE_MS;
      failedAttempts = 0;
      claimSent = false;
      version = state ? version : 0;

      // Carry forward last-known state if we have it; otherwise seed a fresh
      // lobby from scratch. The fresh path is what lets *any* peer restart into
      // an empty room and host a lobby of just themselves — including a former
      // guest with no carried state (previously this branch crashed on null).
      const carried = state;
      const components: Component[] = carried?.components ?? storage.getComponents();
      const firstVotable = components.find((s) => s.enabled && s.average === null);

      // Preferred-host identity to stamp into the room: our own when we *are* the
      // creator, otherwise the best identity we know (link / persisted / carried)
      // so a temporary host still recognises and yields to the real creator.
      const preferredHost: PreferredHost | null = amPreferred
        ? { handle: myHandle, pubKey: hostKey?.pubB64url ?? null }
        : effectivePreferred();

      // Approvals: a preferred host always seeds its own handle (so a temp host
      // recognises it on return) and merges any persisted approvals; a temp host
      // carries whatever it last knew.
      const approvedHandles: Record<string, string> = amPreferred
        ? {
            ...(carried?.approvedHandles ?? storage.getHost()?.approvedHandles ?? {}),
            [myHandle]: nameRef.current,
          }
        : (carried?.approvedHandles ?? {});

      const others = (carried?.players ?? [])
        .filter((p) => p.id !== roomCode && p.id !== myGuestId)
        .map((p) => ({ ...p, vote: null, active: false, connected: false }));
      const seeded: GameState = {
        players: [
          ...others,
          { id: roomCode, name: nameRef.current, vote: null, active: false, connected: true },
        ],
        revealed: false,
        round: carried?.round ?? 1,
        components,
        activeComponentId: carried?.activeComponentId ?? firstVotable?.id ?? null,
        phase: carried?.phase ?? 'voting',
        hostId: roomCode,
        preferredHost,
        // Bump the epoch on a real migration (we had prior state); start at 0 for
        // a brand-new room so the first claim's `epoch + 1` is well-defined.
        migrationEpoch: (carried?.migrationEpoch ?? 0) + (carried ? 1 : 0),
        approvedHandles,
      };
      state = seeded;
      approved = new Set(Object.keys(seeded.approvedHandles));
      if (!disposed) setGameState(seeded);

      // Remember the preferred-host identity so it survives a restart — this is
      // what lets a returning guest-turned-temp-host verify the real creator's
      // takeover after everyone has closed their tabs. Skip a content-free
      // placeholder so we never clobber a real handle we already persisted.
      if (preferredHost && (preferredHost.handle || preferredHost.pubKey)) {
        storage.savePreferredHost(roomCode, preferredHost);
      }
      // The preferred host also persists a host session so a tab close
      // auto-restarts this room as the creator.
      if (amPreferred) {
        storage.saveHost({
          hostName: nameRef.current,
          roomCode,
          approvedHandles: seeded.approvedHandles,
        });
      }

      dlog('becomeHost', {
        kind: amPreferred ? 'preferred' : 'temp',
        fromCarried: !!carried,
        epoch: seeded.migrationEpoch,
        players: seeded.players.length,
        prefHandle: preferredHost?.handle,
        approvedCount: Object.keys(approvedHandles).length,
      });
      setCurRole('host');
      if (!disposed) {
        setMyId(roomCode);
        setIsPreferredHost(amPreferred);
        setStatus('connected');
        setMigrationNotice(null);
      }
      apiRef.current = hostApi;
    };

    const onHostConnection = (conn: DataConnection) => {
      if (connections.size >= MAX_PLAYERS - 1) {
        conn.on('open', () => {
          if (conn.open) {
            conn.send({ type: 'rejected', reason: 'Room is full' } satisfies PeerMessage);
            setTimeout(() => conn.close(), 200);
          }
        });
        return;
      }
      const lastByType = new Map<string, number>();
      conn.on('data', (raw) => {
        const now = Date.now();
        const t = (raw as { type?: string })?.type ?? '';
        if (now - (lastByType.get(t) ?? 0) < MIN_INTERVAL_MS) return;
        lastByType.set(t, now);
        handleHostData(conn, raw);
      });
      conn.on('close', () => {
        // We're tearing our own peer down (role change). The maps get cleared
        // wholesale and we'll re-sync in the new role — don't emit per-peer
        // disconnect deltas against the state we're about to hand off.
        if (tearingDown) return;
        if (pendingConns.get(conn.peer) === conn) {
          pendingConns.delete(conn.peer);
          pendingData.delete(conn.peer);
          refreshPending();
          return;
        }
        if (connections.get(conn.peer) !== conn) return;
        dlog('host:guest-drop', { peer: conn.peer, remaining: connections.size - 1 });
        connections.delete(conn.peer);
        peerToHandle.delete(conn.peer);
        emitDelta(
          (prev) => ({
            ...prev,
            players: prev.players.map((p) =>
              p.id === conn.peer ? { ...p, connected: false } : p,
            ),
          }),
          () => ({ type: 'player-disconnected', id: conn.peer }),
        );
      });
    };

    // Connect to the current host (room code) as a guest.
    const startGuest = () => {
      if (disposed) return;
      const p = new Peer(getPeerConfig());
      peer = p;
      p.on('open', (id) => {
        if (disposed) return;
        myPeerId = id;
        myGuestId = id;
        if (!disposed) setMyId(id);
        dlog('guest:peer-open', { id });
        const conn = p.connect(roomCode, { reliable: true });
        hostConn = conn;
        setCurRole('guest');
        if (!disposed) {
          setIsPreferredHost(false);
          setStatus('connecting');
        }
        apiRef.current = guestApi;
        startStallTimer();
        clear(attemptTimer);
        attemptTimer = setTimeout(() => {
          if (conn.open) return;
          // The connection to the room code never opened. This happens when the
          // broker still holds a just-released id whose dead holder never answers
          // — we get neither 'open' nor 'peer-unavailable', so nothing else will
          // fire. Tear it down and retry unconditionally; previously we only
          // reconnected if close() threw, so a clean close of a never-opened
          // connection stranded the peer forever ("still trying to reach the
          // room" with no recovery). Null out hostConn first so the conn's own
          // 'close'/'error' handlers no-op and don't double-drive recovery.
          failedAttempts++;
          dlog('guest:attempt-timeout', { failed: failedAttempts });
          hostConn = null;
          try {
            conn.close();
          } catch {
            /* best-effort */
          }
          scheduleReconnect();
        }, ATTEMPT_TIMEOUT_MS);

        conn.on('open', () => {
          clear(attemptTimer);
          attemptTimer = undefined;
          stopStallTimer();
          backoff = RECONNECT_BASE_MS;
          failedAttempts = 0;
          if (!disposed) setStatus('pending');
          dlog('guest:conn-open', { to: roomCode });
          conn.send({ type: 'request-join', name: nameRef.current, handle: myHandle } satisfies PeerMessage);
        });
        conn.on('data', (raw) => handleGuestData(conn, raw));
        conn.on('close', () => {
          clear(attemptTimer);
          attemptTimer = undefined;
          if (conn !== hostConn) return;
          synced = false;
          // If we're the preferred host mid-reclaim, the temp host just yielded
          // the room code (it relayed our claim, then tore down our link). Grab
          // the code at once instead of waiting out a reconnect backoff: the
          // longer the room code sits unheld, the more guests thrash trying to
          // reach it and the more likely the temp host re-elects before we
          // return. startHostClaim's own retries ride out the broker's TTL on
          // the just-released id.
          if (amPreferred && claimSent) {
            dlog('guest:conn-close', { next: 'reclaim' });
            stopStallTimer();
            backoff = RECONNECT_BASE_MS;
            attempt();
            return;
          }
          dlog('guest:conn-close', { next: 'reconnect' });
          scheduleReconnect();
        });
        conn.on('error', (err) => {
          if (conn !== hostConn) return;
          dlog('guest:conn-error', { error: String((err as Error)?.message ?? err) });
          scheduleReconnect();
        });
      });
      p.on('connection', (incoming) => {
        // Guests never accept inbound connections.
        incoming.on('open', () => {
          try {
            incoming.close();
          } catch {
            /* best-effort */
          }
        });
      });
      p.on('error', (err) => {
        const type = (err as { type?: string }).type;
        if (type === 'peer-unavailable') {
          failedAttempts++;
          dlog('guest:peer-unavailable', { failed: failedAttempts });
          scheduleReconnect();
          return;
        }
        // A dropped signaling server is recoverable — our connection to the host
        // is independent of the broker, and the `disconnected` handler
        // reconnects. Don't surface a fatal error for a transient blip.
        if (type && RECOVERABLE_PEER_ERRORS.has(type)) {
          dlog('guest:peer-error-recoverable', { type });
          return;
        }
        dlog('guest:peer-error-fatal', { type, msg: err.message });
        terminate(err.message);
      });
      p.on('disconnected', () => {
        if (!p.destroyed) {
          try {
            p.reconnect();
          } catch {
            /* best-effort */
          }
        }
      });
    };

    const terminate = (message: string) => {
      dlog('terminate', { message });
      stopTimers();
      clear(deferTimer);
      if (!disposed) {
        setError(message);
        setStatus('error');
      }
    };

    // ---- public API implementations -------------------------------------
    const guestApi: ApiImpl = {
      vote: (value) => {
        if (!hostConn?.open || !state) return;
        hostConn.send({ type: 'vote', value } satisfies PeerMessage);
        if (myPeerId) {
          const me = myPeerId;
          state = {
            ...state,
            players: state.players.map((p) =>
              p.id === me ? { ...p, vote: value, hasVoted: true } : p,
            ),
          };
          if (!disposed) setGameState(state);
        }
      },
      signalActive: () => {
        if (hostConn?.open) hostConn.send({ type: 'active' } satisfies PeerMessage);
      },
      reveal: () => {},
      newRound: () => {},
      restartRound: () => {},
      approvePlayer: () => {},
      denyPlayer: () => {},
      kickPlayer: () => {},
      addComponent: () => {},
      removeComponent: () => {},
      toggleComponent: () => {},
      renameComponent: () => {},
      nextComponent: () => {},
      newTicket: () => {},
      closeRoom: () => {},
    };

    const hostApi: ApiImpl = {
      vote: (value) => {
        if (!state || state.revealed || state.phase !== 'voting' || !myPeerId) return;
        const me = state.players.find((p) => p.id === myPeerId);
        if (me && me.vote === value) return;
        emitDelta(
          (prev) => game.castVote(prev, myPeerId as string, value),
          () => ({ type: 'voted', id: myPeerId as string }),
        );
      },
      signalActive: () => {
        if (!state || state.revealed || state.phase !== 'voting' || !myPeerId) return;
        const me = state.players.find((p) => p.id === myPeerId);
        if (!me || me.active) return;
        emitDelta(
          (prev) => game.setActive(prev, myPeerId as string),
          () => ({ type: 'player-active', id: myPeerId as string }),
        );
      },
      reveal: () =>
        emitDelta(
          (prev) => game.reveal(prev),
          (next) => ({ type: 'reveal', votes: game.buildRevealVotes(next.players) }),
        ),
      newRound: () => broadcastSnapshot((prev) => game.newRound(prev)),
      restartRound: () => broadcastSnapshot((prev) => game.restartRound(prev)),
      approvePlayer: (peerId) => {
        const conn = pendingConns.get(peerId);
        const pending = pendingData.get(peerId);
        if (!conn || !pending) return;
        pendingConns.delete(peerId);
        pendingData.delete(peerId);
        refreshPending();
        doApprove(conn, peerId, pending.persistentId, pending.name);
      },
      denyPlayer: (peerId) => {
        const conn = pendingConns.get(peerId);
        pendingConns.delete(peerId);
        pendingData.delete(peerId);
        refreshPending();
        if (conn?.open) {
          conn.send({ type: 'rejected', reason: 'Host denied your request' } satisfies PeerMessage);
          setTimeout(() => conn.close(), 200);
        }
      },
      kickPlayer: (peerId) => {
        const conn = connections.get(peerId);
        const handle = peerToHandle.get(peerId);
        connections.delete(peerId);
        peerToHandle.delete(peerId);
        if (handle) approved.delete(handle);
        const nextApproved = { ...(state as GameState).approvedHandles };
        if (handle) delete nextApproved[handle];
        emitDelta(
          (prev) => ({
            ...prev,
            approvedHandles: nextApproved,
            players: prev.players.filter((p) => p.id !== peerId),
          }),
          () => ({ type: 'player-removed', id: peerId }),
        );
        if (handle && amPreferred) storage.removeApprovedHandle(handle);
        if (conn?.open) {
          conn.send({ type: 'rejected', reason: 'You were removed by the host' } satisfies PeerMessage);
          setTimeout(() => conn.close(), 200);
        }
      },
      addComponent: (label) => {
        const trimmed = label.trim().slice(0, MAX_COMPONENT_LABEL_LENGTH);
        if (!trimmed) return;
        const component: Component = {
          id: `${roomCode}-${Date.now().toString(36)}-${Math.floor(version)}`,
          label: trimmed,
          enabled: true,
          average: null,
        };
        broadcastSnapshot((prev) => game.addComponent(prev, component));
      },
      removeComponent: (id) => broadcastSnapshot((prev) => game.removeComponent(prev, id)),
      toggleComponent: (id) => broadcastSnapshot((prev) => game.toggleComponent(prev, id)),
      renameComponent: (id, label) => {
        const trimmed = label.trim().slice(0, MAX_COMPONENT_LABEL_LENGTH);
        if (!trimmed) return;
        const existing = (state as GameState).components.find((s) => s.id === id);
        if (existing && existing.label === trimmed) return;
        broadcastSnapshot((prev) => game.renameComponent(prev, id, trimmed));
      },
      nextComponent: () => broadcastSnapshot((prev) => game.nextComponent(prev)),
      newTicket: () => broadcastSnapshot((prev) => game.newTicket(prev)),
      closeRoom: () => {
        roomClosed = true;
        const announce = (c: DataConnection) => {
          if (c.open) {
            try {
              c.send({ type: 'room-closed' } satisfies PeerMessage);
            } catch {
              /* best-effort */
            }
          }
        };
        connections.forEach(announce);
        pendingConns.forEach(announce);
        storage.clearHost();
        storage.clearComponents();
        storage.clearHostKey(roomCode);
        storage.clearPreferredHost(roomCode);
      },
    };

    // ---- host-departure announcement (instant handoff) ------------------
    // A plain tab/window close fires pagehide/beforeunload while the data
    // channels are still briefly alive. If we're the host, use that window to
    // tell guests we're leaving so they re-elect a new host immediately instead
    // of waiting out the WebRTC connection timeout. A small message handed to an
    // open data channel flushes synchronously, so it makes it out before the tab
    // tears down. Best-effort: if it doesn't, guests still fall back to drop
    // detection. Distinct from closeRoom(), which ends the room for good.
    const announceDeparting = () => {
      if (departed || roomClosed || curRole !== 'host') return;
      departed = true;
      const msg = { type: 'host-departing' } satisfies PeerMessage;
      const send = (c: DataConnection) => {
        if (c.open) {
          try {
            c.send(msg);
          } catch {
            /* best-effort: the tab is going away */
          }
        }
      };
      connections.forEach(send);
      pendingConns.forEach(send);
    };
    // pagehide with persisted=true is a bfcache freeze that keeps the peer
    // alive — don't announce then. (Open WebRTC connections usually disqualify
    // bfcache anyway, but guard regardless.)
    const onPageHide = (e: PageTransitionEvent) => {
      if (!e.persisted) announceDeparting();
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', announceDeparting);

    // ---- kickoff ---------------------------------------------------------
    amPreferred = isPreferred();
    dlog('kickoff', {
      intent,
      pref: amPreferred,
      hasHostKey: !!hostKey,
      hasCrypto: cryptoAvailable(),
      pinnedPref: pinnedPreferred ? { handle: pinnedPreferred.handle, hasKey: !!pinnedPreferred.pubKey } : null,
      savedHostRoom: storage.getHost()?.roomCode ?? null,
      myHandle,
    });
    const startSession = () => {
      if (!disposed) attempt();
    };
    // Generate the preferred-host keypair before claiming the room (only the
    // creator, only when there isn't one yet, only in a secure context). When
    // crypto is unavailable we proceed synchronously on the degraded path.
    if (intent === 'create' && !hostKey && cryptoAvailable()) {
      createHostKeypair()
        .then((created) => {
          if (disposed) return;
          if (created) {
            hostKey = created;
            storage.saveHostKey(roomCode, created);
          } else {
            dlog('keypair:null'); // secure context but generation returned null
          }
          startSession();
        })
        .catch((e) => {
          dlog('keypair:error', { error: String(e) });
          if (!disposed) startSession();
        });
    } else {
      startSession();
    }

    return () => {
      disposed = true;
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', announceDeparting);
      clear(deferTimer);
      teardownPeer();
      apiRef.current = NOOP_API;
    };
  }, [roomCode, intent, pinnedPubKey]);

  const vote = useCallback((value: CardValue) => apiRef.current.vote(value), []);
  const signalActive = useCallback(() => apiRef.current.signalActive(), []);
  const reveal = useCallback(() => apiRef.current.reveal(), []);
  const newRound = useCallback(() => apiRef.current.newRound(), []);
  const restartRound = useCallback(() => apiRef.current.restartRound(), []);
  const approvePlayer = useCallback((peerId: string) => apiRef.current.approvePlayer(peerId), []);
  const denyPlayer = useCallback((peerId: string) => apiRef.current.denyPlayer(peerId), []);
  const kickPlayer = useCallback((peerId: string) => apiRef.current.kickPlayer(peerId), []);
  const addComponent = useCallback((label: string) => apiRef.current.addComponent(label), []);
  const removeComponent = useCallback((id: string) => apiRef.current.removeComponent(id), []);
  const toggleComponent = useCallback((id: string) => apiRef.current.toggleComponent(id), []);
  const renameComponent = useCallback(
    (id: string, label: string) => apiRef.current.renameComponent(id, label),
    [],
  );
  const nextComponent = useCallback(() => apiRef.current.nextComponent(), []);
  const newTicket = useCallback(() => apiRef.current.newTicket(), []);
  const closeRoom = useCallback(() => apiRef.current.closeRoom(), []);

  return {
    role,
    isPreferredHost,
    roomCode,
    myId,
    gameState,
    status,
    stalled,
    pendingPlayers,
    error,
    migrationNotice,
    vote,
    signalActive,
    reveal,
    newRound,
    restartRound,
    approvePlayer,
    denyPlayer,
    kickPlayer,
    addComponent,
    removeComponent,
    toggleComponent,
    renameComponent,
    nextComponent,
    newTicket,
    closeRoom,
  };
}
