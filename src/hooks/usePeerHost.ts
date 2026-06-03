import { useEffect, useRef, useState, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
import {
  CardValue,
  GameState,
  PeerMessage,
  StateDeltaBody,
  PendingEntry,
  Player,
  Component,
  MAX_PLAYERS,
  MAX_COMPONENT_LABEL_LENGTH,
} from '../domain/types';
import { isPeerMessage } from '../domain/validation';
import { randomId } from '../lib/id';
import * as game from '../domain/gameLogic';
import { getPeerConfig } from '../lib/peerConfig';

// Send a rejection message, then close shortly after so the message has time to
// flush across the data channel before the connection tears down.
function rejectAndClose(conn: DataConnection, reason: string): void {
  if (!conn.open) return;
  conn.send({ type: 'rejected', reason } satisfies PeerMessage);
  setTimeout(() => conn.close(), 200);
}

// Build the full-state message for one recipient at a given version. Used on
// join, on resync, and on structural transitions.
function snapshotMessage(state: GameState, peerId: string, version: number): PeerMessage {
  return { type: 'snapshot', version, state: game.redactForClient(state, peerId) };
}

export interface UsePeerHostOptions {
  roomCode?: string;
  approvedPlayers?: Record<string, string>; // persistentId → name
  initialComponents?: Component[];
  onApprove?: (persistentId: string, name: string) => void;
  onKick?: (persistentId: string) => void;
}

export interface UsePeerHostReturn {
  roomId: string | null;
  gameState: GameState;
  pendingPlayers: PendingEntry[];
  reveal: () => void;
  newRound: () => void;
  restartRound: () => void;
  approvePlayer: (peerId: string) => void;
  denyPlayer: (peerId: string) => void;
  kickPlayer: (peerId: string) => void;
  castHostVote: (value: CardValue | null) => void;
  castHostActive: () => void;
  error: string | null;
  addComponent: (label: string) => void;
  removeComponent: (id: string) => void;
  toggleComponent: (id: string) => void;
  renameComponent: (id: string, label: string) => void;
  nextComponent: () => void;
  newTicket: () => void;
}

export function usePeerHost(hostName: string, options: UsePeerHostOptions = {}): UsePeerHostReturn {
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const pendingConnsRef = useRef<Map<string, DataConnection>>(new Map());
  const pendingDataRef = useRef<Map<string, PendingEntry>>(new Map());
  const peerToPersistentIdRef = useRef<Map<string, string>>(new Map());

  // Source of truth for which persistent IDs auto-approve. Seeded from props on
  // first render; kept in sync internally as players are approved or kicked so
  // we never go stale against the prop snapshot.
  const approvedIdsRef = useRef<Set<string> | null>(null);
  if (approvedIdsRef.current === null) {
    approvedIdsRef.current = new Set(Object.keys(options.approvedPlayers ?? {}));
  }

  // Keep options current without causing effect re-runs
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Same pattern for hostName — so renaming doesn't tear down the peer / room.
  const hostNameRef = useRef(hostName);
  hostNameRef.current = hostName;

  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingPlayers, setPendingPlayers] = useState<PendingEntry[]>([]);
  const [gameState, setGameState] = useState<GameState>(() => {
    const components = options.initialComponents ?? [];
    const firstVotable = components.find((s) => s.enabled && s.average === null);
    return {
      players: [],
      revealed: false,
      round: 1,
      components,
      activeComponentId: firstVotable?.id ?? null,
      phase: 'voting',
      hostId: null,
    };
  });

  // Always-current ref so callbacks can read and compute the next state
  // synchronously without relying on React's async state batching.
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  // Monotonic state version. Every host→client sync message (snapshot or delta)
  // carries the version it produces; clients use it to detect a missed update
  // and request a resync. Persisted in a ref so it survives re-renders.
  const versionRef = useRef(0);

  // Commit a new state locally and bump the version. Returns the new version so
  // the caller can stamp the outgoing message(s). No sends here — the caller
  // decides between a delta (cheap) and a full snapshot (structural changes).
  const commit = useCallback((next: GameState): number => {
    gameStateRef.current = next;
    setGameState(next);
    versionRef.current += 1;
    return versionRef.current;
  }, []);

  // Compute next state, commit it, and broadcast a full per-recipient snapshot.
  // Use for structural transitions (round/phase/component changes) where a
  // targeted delta would be fragile.
  const updateStateSnapshot = useCallback(
    (updater: (prev: GameState) => GameState) => {
      const next = updater(gameStateRef.current);
      const version = commit(next);
      connectionsRef.current.forEach((conn, peerId) => {
        if (conn.open) conn.send(snapshotMessage(next, peerId, version));
      });
    },
    [commit],
  );

  // Compute next state, commit it, then broadcast a small delta describing what
  // changed. `makeDelta` is given the committed state so it can derive payloads
  // (e.g. reveal votes). `exceptPeerId` skips one connection (e.g. the joiner,
  // who receives a full snapshot instead).
  const emitDelta = useCallback(
    (
      updater: (prev: GameState) => GameState,
      makeDelta: (next: GameState) => StateDeltaBody,
      exceptPeerId?: string,
    ) => {
      const next = updater(gameStateRef.current);
      const version = commit(next);
      const msg = { ...makeDelta(next), version } as PeerMessage;
      connectionsRef.current.forEach((conn, peerId) => {
        if (peerId === exceptPeerId) return;
        if (conn.open) conn.send(msg);
      });
    },
    [commit],
  );

  // Shared approval logic — callable from both auto-approve and manual approve paths
  const doApprove = useCallback(
    (conn: DataConnection, peerId: string, persistentId: string, name: string) => {
      // If a prior connection for the same peer is still in the map (rapid
      // refresh, network blip), close it explicitly so its 'close' handler
      // can't race the new one into marking the player disconnected.
      const prior = connectionsRef.current.get(peerId);
      if (prior && prior !== conn) {
        try {
          prior.close();
        } catch {
          // best-effort
        }
      }
      connectionsRef.current.set(peerId, conn);
      peerToPersistentIdRef.current.set(peerId, persistentId);

      // Direct one-shot 'approved' — not part of broadcast state.
      if (conn.open) {
        conn.send({ type: 'approved' });
      }

      // Add/refresh the player. The joiner gets a full snapshot (it has no
      // base state yet); everyone else gets a cheap player-joined delta.
      const newPlayer: Player = { id: peerId, name, vote: null, connected: true };
      const next: GameState = {
        ...gameStateRef.current,
        players: [...gameStateRef.current.players.filter((p) => p.id !== peerId), newPlayer],
      };
      const version = commit(next);
      if (conn.open) conn.send(snapshotMessage(next, peerId, version));
      const joinedMsg: PeerMessage = {
        type: 'player-joined',
        version,
        player: { ...newPlayer, hasVoted: false },
      };
      connectionsRef.current.forEach((other, otherId) => {
        if (otherId === peerId) return;
        if (other.open) other.send(joinedMsg);
      });

      approvedIdsRef.current!.add(persistentId);
      optionsRef.current.onApprove?.(persistentId, name);
    },
    [commit],
  );

  // Keep doApprove stable via ref so data-handler closures stay current
  const doApproveRef = useRef(doApprove);
  doApproveRef.current = doApprove;

  useEffect(() => {
    const userSuppliedCode = optionsRef.current.roomCode;
    const code = userSuppliedCode ?? game.generateRoomCode();
    // Retry the same code up to N times before falling back to a new one —
    // covers StrictMode double-mount and the broker's short TTL after refresh.
    let unavailableRetries = 0;
    const MAX_UNAVAILABLE_RETRIES = 3;

    function setupPeer(peerId: string) {
      const peer = new Peer(peerId, getPeerConfig());
      peerRef.current = peer;

      peer.on('open', (id) => {
        setRoomId(id);
        // Merge: don't clobber any players that may already have been added.
        const prev = gameStateRef.current;
        const hostExists = prev.players.some((p) => p.id === id);
        const next: GameState = {
          ...prev,
          hostId: id,
          players: hostExists
            ? prev.players
            : [
                { id, name: hostNameRef.current, vote: null, connected: true },
                ...prev.players.filter((p) => p.id !== id),
              ],
        };
        gameStateRef.current = next;
        setGameState(next);
      });

      peer.on('error', (err) => {
        const type = (err as { type?: string }).type;
        // The requested ID is already registered on the broker — happens when
        // React StrictMode double-mounts the effect, or when the host refreshes
        // before the broker's TTL expires.
        if (type === 'unavailable-id') {
          peer.destroy();
          if (unavailableRetries < MAX_UNAVAILABLE_RETRIES) {
            unavailableRetries++;
            // Backoff: 200ms, 600ms, 1200ms — broker TTL is short, this is usually enough.
            const delay = 200 * unavailableRetries * unavailableRetries;
            setTimeout(() => setupPeer(peerId), delay);
            return;
          }
          // User supplied a code we still can't claim — surface it instead of
          // silently switching the user to a different room.
          if (userSuppliedCode && peerId === userSuppliedCode) {
            setError(
              `Room code "${peerId}" is currently unavailable. Please close this room and create a new one.`,
            );
            return;
          }
          // Auto-generated code collision (rare): fall back to a fresh code.
          setupPeer(game.generateRoomCode());
          return;
        }
        // Non-fatal: a specific peer couldn't be reached. Logging only — keeps
        // the host alive so other clients can still connect.
        if (type === 'peer-unavailable') {
          console.warn('[usePeerHost] peer-unavailable:', err.message);
          return;
        }
        setError(err.message);
      });

      peer.on('disconnected', () => {
        // Lost signaling to the broker but existing data connections survive.
        // Reconnect so new clients can still join.
        if (!peer.destroyed) {
          try {
            peer.reconnect();
          } catch (e) {
            console.warn('[usePeerHost] reconnect failed:', e);
          }
        }
      });

      peer.on('connection', (conn) => {
        // Cap by player count (host is in `players` but not in `connectionsRef`),
        // so use MAX_PLAYERS - 1 against the conn map.
        if (connectionsRef.current.size >= MAX_PLAYERS - 1) {
          conn.on('open', () => rejectAndClose(conn, 'Room is full'));
          return;
        }

        // Per-connection throttle: drop messages that arrive faster than the
        // floor below. Bounds DoS via spam-driven rebroadcasts.
        const MIN_INTERVAL_MS = 50;
        let lastMsgAt = 0;

        conn.on('data', (raw) => {
          if (!isPeerMessage(raw)) return;
          const now = Date.now();
          if (now - lastMsgAt < MIN_INTERVAL_MS) return;
          lastMsgAt = now;

          if (raw.type === 'request-join') {
            const { name, persistentId } = raw;
            const peerId = conn.peer;

            // Reject if another connected player or pending guest already holds this name.
            // A returning guest (same persistentId) is allowed to keep theirs.
            if (
              game.isNameTaken(
                gameStateRef.current.players,
                peerToPersistentIdRef.current,
                [...pendingDataRef.current.values()],
                persistentId,
                name,
              )
            ) {
              rejectAndClose(conn, 'That name is already in use. Please choose another.');
              return;
            }

            if (approvedIdsRef.current!.has(persistentId)) {
              // Previously approved — let back in without host interaction
              doApproveRef.current(conn, peerId, persistentId, name);
              return;
            }

            // Queue for manual host approval
            const entry: PendingEntry = { id: peerId, name, persistentId };
            pendingConnsRef.current.set(peerId, conn);
            pendingDataRef.current.set(peerId, entry);
            setPendingPlayers((prev) => [...prev.filter((p) => p.id !== peerId), entry]);
            return;
          }

          if (raw.type === 'vote') {
            // Ignore votes once results are revealed or outside the voting phase —
            // otherwise a guest can mutate their displayed vote after consensus.
            if (gameStateRef.current.revealed || gameStateRef.current.phase !== 'voting') return;
            // Only the currently-approved connection for this peer may vote.
            // Stale/replaced/pending connections can't trigger broadcasts.
            if (connectionsRef.current.get(conn.peer) !== conn) return;
            emitDelta(
              (prev) => game.castVote(prev, conn.peer, raw.value),
              () => ({ type: 'voted', id: conn.peer }),
            );
          }

          if (raw.type === 'active') {
            // One-shot "engaging with the deck" signal; ignore once revealed.
            if (gameStateRef.current.revealed || gameStateRef.current.phase !== 'voting') return;
            if (connectionsRef.current.get(conn.peer) !== conn) return;
            const existing = gameStateRef.current.players.find((p) => p.id === conn.peer);
            if (!existing || existing.active) return;
            emitDelta(
              (prev) => game.setActive(prev, conn.peer),
              () => ({ type: 'player-active', id: conn.peer }),
            );
          }

          if (raw.type === 'request-resync') {
            // Client missed an update — re-send the current full state to it
            // alone, at the current version (no bump; nothing changed).
            if (connectionsRef.current.get(conn.peer) !== conn) return;
            if (conn.open) {
              conn.send(snapshotMessage(gameStateRef.current, conn.peer, versionRef.current));
            }
          }
        });

        conn.on('close', () => {
          if (pendingConnsRef.current.get(conn.peer) === conn) {
            pendingConnsRef.current.delete(conn.peer);
            pendingDataRef.current.delete(conn.peer);
            setPendingPlayers((prev) => prev.filter((p) => p.id !== conn.peer));
            return;
          }
          // Only mark disconnected if this conn is still the active one for
          // the peer. A rapid reconnect may have replaced it; in that case
          // the old close should be a no-op.
          if (connectionsRef.current.get(conn.peer) !== conn) return;
          connectionsRef.current.delete(conn.peer);
          peerToPersistentIdRef.current.delete(conn.peer);
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
      });
    }

    setupPeer(code);

    return () => {
      peerRef.current?.destroy();
    };
    // hostName and options are read via refs so renaming / prop changes don't
    // tear down the peer and room — emitDelta is the only real dependency.
  }, [emitDelta]);

  const approvePlayer = useCallback(
    (peerId: string) => {
      const conn = pendingConnsRef.current.get(peerId);
      const pending = pendingDataRef.current.get(peerId);
      if (!conn || !pending) return;

      pendingConnsRef.current.delete(peerId);
      pendingDataRef.current.delete(peerId);
      setPendingPlayers((prev) => prev.filter((p) => p.id !== peerId));

      doApprove(conn, peerId, pending.persistentId, pending.name);
    },
    [doApprove],
  );

  const denyPlayer = useCallback((peerId: string) => {
    const conn = pendingConnsRef.current.get(peerId);
    pendingConnsRef.current.delete(peerId);
    pendingDataRef.current.delete(peerId);
    setPendingPlayers((prev) => prev.filter((p) => p.id !== peerId));
    if (conn) rejectAndClose(conn, 'Host denied your request');
  }, []);

  const kickPlayer = useCallback(
    (peerId: string) => {
      const conn = connectionsRef.current.get(peerId);
      const persistentId = peerToPersistentIdRef.current.get(peerId);

      connectionsRef.current.delete(peerId);
      peerToPersistentIdRef.current.delete(peerId);

      // The kicked conn is already out of connectionsRef, so this delta only
      // reaches the remaining players.
      emitDelta(
        (prev) => ({
          ...prev,
          players: prev.players.filter((p) => p.id !== peerId),
        }),
        () => ({ type: 'player-removed', id: peerId }),
      );

      if (conn) rejectAndClose(conn, 'You were removed by the host');

      if (persistentId) {
        approvedIdsRef.current!.delete(persistentId);
        optionsRef.current.onKick?.(persistentId);
      }
    },
    [emitDelta],
  );

  const castHostVote = useCallback(
    (value: CardValue | null) => {
      const hostId = peerRef.current?.id;
      if (!hostId) return;
      if (gameStateRef.current.revealed || gameStateRef.current.phase !== 'voting') return;
      emitDelta(
        (prev) => game.castVote(prev, hostId, value),
        () => (value === null ? { type: 'unvoted', id: hostId } : { type: 'voted', id: hostId }),
      );
    },
    [emitDelta],
  );

  const castHostActive = useCallback(() => {
    const hostId = peerRef.current?.id;
    if (!hostId) return;
    if (gameStateRef.current.revealed || gameStateRef.current.phase !== 'voting') return;
    const me = gameStateRef.current.players.find((p) => p.id === hostId);
    if (!me || me.active) return;
    emitDelta(
      (prev) => game.setActive(prev, hostId),
      () => ({ type: 'player-active', id: hostId }),
    );
  }, [emitDelta]);

  const reveal = useCallback(() => {
    emitDelta(
      (prev) => game.reveal(prev),
      (next) => ({ type: 'reveal', votes: game.buildRevealVotes(next.players) }),
    );
  }, [emitDelta]);

  const newRound = useCallback(() => {
    updateStateSnapshot((prev) => game.newRound(prev));
  }, [updateStateSnapshot]);

  const restartRound = useCallback(() => {
    updateStateSnapshot((prev) => game.restartRound(prev));
  }, [updateStateSnapshot]);

  const addComponent = useCallback(
    (label: string) => {
      const trimmed = label.trim().slice(0, MAX_COMPONENT_LABEL_LENGTH);
      if (!trimmed) return;
      const component: Component = { id: randomId(), label: trimmed, enabled: true, average: null };
      updateStateSnapshot((prev) => game.addComponent(prev, component));
    },
    [updateStateSnapshot],
  );

  const removeComponent = useCallback(
    (id: string) => {
      updateStateSnapshot((prev) => game.removeComponent(prev, id));
    },
    [updateStateSnapshot],
  );

  const toggleComponent = useCallback(
    (id: string) => {
      updateStateSnapshot((prev) => game.toggleComponent(prev, id));
    },
    [updateStateSnapshot],
  );

  const renameComponent = useCallback(
    (id: string, label: string) => {
      const trimmed = label.trim().slice(0, MAX_COMPONENT_LABEL_LENGTH);
      if (!trimmed) return;
      updateStateSnapshot((prev) => game.renameComponent(prev, id, trimmed));
    },
    [updateStateSnapshot],
  );

  const nextComponent = useCallback(() => {
    updateStateSnapshot((prev) => game.nextComponent(prev));
  }, [updateStateSnapshot]);

  const newTicket = useCallback(() => {
    updateStateSnapshot((prev) => game.newTicket(prev));
  }, [updateStateSnapshot]);

  return {
    roomId,
    gameState,
    pendingPlayers,
    reveal,
    newRound,
    restartRound,
    approvePlayer,
    denyPlayer,
    kickPlayer,
    castHostVote,
    castHostActive,
    error,
    addComponent,
    removeComponent,
    toggleComponent,
    renameComponent,
    nextComponent,
    newTicket,
  };
}
