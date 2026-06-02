import { useEffect, useRef, useState, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
import {
  CardValue,
  GameState,
  PeerMessage,
  PendingEntry,
  Player,
  Story,
  isPeerMessage,
  randomId,
  MAX_PLAYERS,
} from '../types';
import * as game from '../gameLogic';

export interface UsePeerHostOptions {
  roomCode?: string;
  approvedPlayers?: Record<string, string>; // persistentId → name
  initialStories?: Story[];
  onApprove?: (persistentId: string, name: string) => void;
  onKick?: (persistentId: string) => void;
}

export interface UsePeerHostReturn {
  roomId: string | null;
  gameState: GameState;
  pendingPlayers: PendingEntry[];
  reveal: () => void;
  newRound: () => void;
  approvePlayer: (peerId: string) => void;
  denyPlayer: (peerId: string) => void;
  kickPlayer: (peerId: string) => void;
  castHostVote: (value: CardValue | null) => void;
  castHostActive: () => void;
  error: string | null;
  addStory: (label: string) => void;
  removeStory: (id: string) => void;
  toggleStory: (id: string) => void;
  renameStory: (id: string, label: string) => void;
  nextStory: () => void;
  newSprint: () => void;
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
    const stories = options.initialStories ?? [];
    const firstVotable = stories.find((s) => s.enabled && s.average === null);
    return {
      players: [],
      revealed: false,
      round: 1,
      stories,
      activeStoryId: firstVotable?.id ?? null,
      phase: 'voting',
      hostId: null,
    };
  });

  // Always-current ref so callbacks can read and compute the next state
  // synchronously without relying on React's async state batching.
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const broadcast = useCallback((state: GameState) => {
    connectionsRef.current.forEach((conn, peerId) => {
      if (conn.open) {
        const redacted = game.redactForClient(state, peerId);
        conn.send({ type: 'state', state: redacted } satisfies PeerMessage);
      }
    });
  }, []);

  // Compute next state, commit it to the ref immediately, then hand it to
  // React and broadcast — no side effects inside the setState updater.
  const updateState = useCallback(
    (updater: (prev: GameState) => GameState) => {
      const next = updater(gameStateRef.current);
      gameStateRef.current = next;
      setGameState(next);
      broadcast(next);
    },
    [broadcast],
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

      // Add/refresh the player and broadcast — broadcast now hits the new
      // conn too since we just added it to connectionsRef.
      updateState((prev) => {
        const newPlayer: Player = { id: peerId, name, vote: null, connected: true };
        return {
          ...prev,
          players: [...prev.players.filter((p) => p.id !== peerId), newPlayer],
        };
      });

      approvedIdsRef.current!.add(persistentId);
      optionsRef.current.onApprove?.(persistentId, name);
    },
    [updateState],
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
      const peer = new Peer(peerId);
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
            setError(`Room code "${peerId}" is currently unavailable. Please close this room and create a new one.`);
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
          conn.on('open', () => {
            conn.send({ type: 'rejected', reason: 'Room is full' });
            setTimeout(() => conn.close(), 200);
          });
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
              if (conn.open) {
                conn.send({
                  type: 'rejected',
                  reason: 'That name is already in use. Please choose another.',
                } satisfies PeerMessage);
                setTimeout(() => conn.close(), 200);
              }
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
            updateState((prev) => game.castVote(prev, conn.peer, raw.value));
          }

          if (raw.type === 'active') {
            // One-shot "engaging with the deck" signal; ignore once revealed.
            if (gameStateRef.current.revealed || gameStateRef.current.phase !== 'voting') return;
            if (connectionsRef.current.get(conn.peer) !== conn) return;
            const existing = gameStateRef.current.players.find((p) => p.id === conn.peer);
            if (!existing || existing.active) return;
            updateState((prev) => game.setActive(prev, conn.peer));
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
          updateState((prev) => ({
            ...prev,
            players: prev.players.map((p) =>
              p.id === conn.peer ? { ...p, connected: false } : p,
            ),
          }));
        });
      });
    }

    setupPeer(code);

    return () => {
      peerRef.current?.destroy();
    };
    // hostName is read via hostNameRef so renaming doesn't tear down the room.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateState]);

  const approvePlayer = useCallback((peerId: string) => {
    const conn = pendingConnsRef.current.get(peerId);
    const pending = pendingDataRef.current.get(peerId);
    if (!conn || !pending) return;

    pendingConnsRef.current.delete(peerId);
    pendingDataRef.current.delete(peerId);
    setPendingPlayers((prev) => prev.filter((p) => p.id !== peerId));

    doApprove(conn, peerId, pending.persistentId, pending.name);
  }, [doApprove]);

  const denyPlayer = useCallback((peerId: string) => {
    const conn = pendingConnsRef.current.get(peerId);
    pendingConnsRef.current.delete(peerId);
    pendingDataRef.current.delete(peerId);
    setPendingPlayers((prev) => prev.filter((p) => p.id !== peerId));
    if (conn?.open) {
      conn.send({ type: 'rejected', reason: 'Host denied your request' } satisfies PeerMessage);
      setTimeout(() => conn.close(), 200);
    }
  }, []);

  const kickPlayer = useCallback((peerId: string) => {
    const conn = connectionsRef.current.get(peerId);
    const persistentId = peerToPersistentIdRef.current.get(peerId);

    connectionsRef.current.delete(peerId);
    peerToPersistentIdRef.current.delete(peerId);

    updateState((prev) => ({
      ...prev,
      players: prev.players.filter((p) => p.id !== peerId),
    }));

    if (conn?.open) {
      conn.send({ type: 'rejected', reason: 'You were removed by the host' } satisfies PeerMessage);
      setTimeout(() => conn.close(), 200);
    }

    if (persistentId) {
      approvedIdsRef.current!.delete(persistentId);
      optionsRef.current.onKick?.(persistentId);
    }
  }, [updateState]);

  const castHostVote = useCallback(
    (value: CardValue | null) => {
      const hostId = peerRef.current?.id;
      if (!hostId) return;
      if (gameStateRef.current.revealed || gameStateRef.current.phase !== 'voting') return;
      updateState((prev) => game.castVote(prev, hostId, value));
    },
    [updateState],
  );

  const castHostActive = useCallback(() => {
    const hostId = peerRef.current?.id;
    if (!hostId) return;
    if (gameStateRef.current.revealed || gameStateRef.current.phase !== 'voting') return;
    const me = gameStateRef.current.players.find((p) => p.id === hostId);
    if (!me || me.active) return;
    updateState((prev) => game.setActive(prev, hostId));
  }, [updateState]);

  const reveal = useCallback(() => {
    updateState((prev) => game.reveal(prev));
  }, [updateState]);

  const newRound = useCallback(() => {
    updateState((prev) => game.newRound(prev));
  }, [updateState]);

  const addStory = useCallback((label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const story: Story = { id: randomId(), label: trimmed, enabled: true, average: null };
    updateState((prev) => game.addStory(prev, story));
  }, [updateState]);

  const removeStory = useCallback((id: string) => {
    updateState((prev) => game.removeStory(prev, id));
  }, [updateState]);

  const toggleStory = useCallback((id: string) => {
    updateState((prev) => game.toggleStory(prev, id));
  }, [updateState]);

  const renameStory = useCallback((id: string, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    updateState((prev) => game.renameStory(prev, id, trimmed));
  }, [updateState]);

  const nextStory = useCallback(() => {
    updateState((prev) => game.nextStory(prev));
  }, [updateState]);

  const newSprint = useCallback(() => {
    updateState((prev) => game.newSprint(prev));
  }, [updateState]);

  return {
    roomId,
    gameState,
    pendingPlayers,
    reveal,
    newRound,
    approvePlayer,
    denyPlayer,
    kickPlayer,
    castHostVote,
    castHostActive,
    error,
    addStory,
    removeStory,
    toggleStory,
    renameStory,
    nextStory,
    newSprint,
  };
}
