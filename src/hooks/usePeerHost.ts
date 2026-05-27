import { useEffect, useRef, useState, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
import {
  CardValue,
  GamePhase,
  GameState,
  PeerMessage,
  PendingEntry,
  Player,
  Story,
  isPeerMessage,
  MAX_PLAYERS,
} from '../types';

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
  error: string | null;
  addStory: (label: string) => void;
  removeStory: (id: string) => void;
  toggleStory: (id: string) => void;
  startVoting: () => void;
  nextStory: () => void;
  newSprint: () => void;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  // NOTE: signaling goes through broker.peerjs.com. To self-host, pass host/port/path
  // options to `new Peer(id, options)`. See https://github.com/peers/peerserver
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
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
  const [gameState, setGameState] = useState<GameState>(() => ({
    players: [],
    revealed: false,
    round: 1,
    stories: options.initialStories ?? [],
    activeStoryId: null,
    phase: 'setup',
  }));

  // Always-current ref so callbacks can read and compute the next state
  // synchronously without relying on React's async state batching.
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const broadcast = useCallback((state: GameState) => {
    const msg: PeerMessage = { type: 'state', state };
    connectionsRef.current.forEach((conn) => {
      if (conn.open) conn.send(msg);
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
      connectionsRef.current.set(peerId, conn);
      peerToPersistentIdRef.current.set(peerId, persistentId);

      const newPlayer: Player = { id: peerId, name, vote: null, connected: true };
      const prev = gameStateRef.current;
      const next: GameState = {
        ...prev,
        players: [...prev.players.filter((p) => p.id !== peerId), newPlayer],
      };
      gameStateRef.current = next;
      setGameState(next);

      // Send outside any React updater so messages are always dispatched exactly once.
      if (conn.open) {
        conn.send({ type: 'approved' } as PeerMessage);
        conn.send({ type: 'state', state: next } as PeerMessage);
      }
      connectionsRef.current.forEach((c) => {
        if (c.open && c !== conn) c.send({ type: 'state', state: next } as PeerMessage);
      });

      approvedIdsRef.current!.add(persistentId);
      optionsRef.current.onApprove?.(persistentId, name);
    },
    [],
  );

  // Keep doApprove stable via ref so data-handler closures stay current
  const doApproveRef = useRef(doApprove);
  doApproveRef.current = doApprove;

  useEffect(() => {
    const code = optionsRef.current.roomCode ?? generateRoomCode();

    function setupPeer(peerId: string) {
      const peer = new Peer(peerId);
      peerRef.current = peer;

      peer.on('open', (id) => {
        setRoomId(id);
        const next: GameState = {
          ...gameStateRef.current,
          players: [{ id, name: hostNameRef.current, vote: null, connected: true }],
        };
        gameStateRef.current = next;
        setGameState(next);
      });

      peer.on('error', (err) => {
        const type = (err as { type?: string }).type;
        // The requested ID is already registered on the broker — happens when
        // React StrictMode double-mounts the effect, or when the host refreshes
        // before the broker's TTL expires. Retry with a freshly generated code.
        if (type === 'unavailable-id') {
          peer.destroy();
          setupPeer(generateRoomCode());
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
        if (connectionsRef.current.size >= MAX_PLAYERS) {
          conn.on('open', () => {
            conn.send({ type: 'rejected', reason: 'Room is full' } as PeerMessage);
            setTimeout(() => conn.close(), 200);
          });
          return;
        }

        conn.on('data', (raw) => {
          if (!isPeerMessage(raw)) return;

          if (raw.type === 'request-join') {
            const { name, persistentId } = raw;
            const peerId = conn.peer;
            const normalized = name.trim().toLowerCase();

            // Reject if another connected player or pending guest already holds this name.
            // A returning guest (same persistentId) is allowed to keep theirs.
            const takenByPlayer = gameStateRef.current.players.some(
              (p) =>
                p.connected &&
                peerToPersistentIdRef.current.get(p.id) !== persistentId &&
                p.name.trim().toLowerCase() === normalized,
            );
            const takenByPending = [...pendingDataRef.current.values()].some(
              (p) => p.persistentId !== persistentId && p.name.trim().toLowerCase() === normalized,
            );
            if (takenByPlayer || takenByPending) {
              if (conn.open) {
                conn.send({
                  type: 'rejected',
                  reason: 'That name is already in use. Please choose another.',
                } as PeerMessage);
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
            updateState((prev) => ({
              ...prev,
              players: prev.players.map((p) =>
                p.id === conn.peer ? { ...p, vote: raw.value } : p,
              ),
            }));
          }
        });

        conn.on('close', () => {
          if (pendingConnsRef.current.has(conn.peer)) {
            pendingConnsRef.current.delete(conn.peer);
            pendingDataRef.current.delete(conn.peer);
            setPendingPlayers((prev) => prev.filter((p) => p.id !== conn.peer));
          } else {
            connectionsRef.current.delete(conn.peer);
            peerToPersistentIdRef.current.delete(conn.peer);
            updateState((prev) => ({
              ...prev,
              players: prev.players.map((p) =>
                p.id === conn.peer ? { ...p, connected: false } : p,
              ),
            }));
          }
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
      conn.send({ type: 'rejected', reason: 'Host denied your request' } as PeerMessage);
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
      conn.send({ type: 'rejected', reason: 'You were removed by the host' } as PeerMessage);
      setTimeout(() => conn.close(), 200);
    }

    if (persistentId) {
      approvedIdsRef.current!.delete(persistentId);
      optionsRef.current.onKick?.(persistentId);
    }
  }, [updateState]);

  const castHostVote = useCallback(
    (value: CardValue | null) => {
      const next: GameState = {
        ...gameStateRef.current,
        players: gameStateRef.current.players.map((p) =>
          p.id === peerRef.current?.id ? { ...p, vote: value } : p,
        ),
      };
      gameStateRef.current = next;
      setGameState(next);
      broadcast(next);
    },
    [broadcast],
  );

  const reveal = useCallback(() => {
    updateState((prev) => ({ ...prev, revealed: true }));
  }, [updateState]);

  const newRound = useCallback(() => {
    updateState((prev) => ({
      ...prev,
      revealed: false,
      round: prev.round + 1,
      // Drop players who are still disconnected — they sat out the prior round
      // and shouldn't accumulate in the list across rounds.
      players: prev.players.filter((p) => p.connected).map((p) => ({ ...p, vote: null })),
    }));
  }, [updateState]);

  const addStory = useCallback((label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const story: Story = { id: crypto.randomUUID(), label: trimmed, enabled: true, average: null };
    updateState((prev) => ({ ...prev, stories: [...prev.stories, story] }));
  }, [updateState]);

  const removeStory = useCallback((id: string) => {
    updateState((prev) => ({ ...prev, stories: prev.stories.filter((s) => s.id !== id) }));
  }, [updateState]);

  const toggleStory = useCallback((id: string) => {
    updateState((prev) => ({
      ...prev,
      stories: prev.stories.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
    }));
  }, [updateState]);

  const startVoting = useCallback(() => {
    updateState((prev) => {
      const first = prev.stories.find((s) => s.enabled && s.average === null);
      if (!first) return prev;
      return {
        ...prev,
        phase: 'voting' as GamePhase,
        activeStoryId: first.id,
        revealed: false,
        players: prev.players.filter((p) => p.connected).map((p) => ({ ...p, vote: null })),
      };
    });
  }, [updateState]);

  const nextStory = useCallback(() => {
    updateState((prev) => {
      const numericVotes = prev.players
        .filter((p) => p.connected && p.vote !== null && p.vote !== '?')
        .map((p) => p.vote as number);
      const average =
        numericVotes.length > 0
          ? Math.round((numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length) * 10) / 10
          : null;

      const stories = prev.stories.map((s) =>
        s.id === prev.activeStoryId ? { ...s, average } : s,
      );

      const currentIdx = stories.findIndex((s) => s.id === prev.activeStoryId);
      const next = stories.find((s, i) => i > currentIdx && s.enabled && s.average === null);

      if (!next) {
        return {
          ...prev,
          stories,
          activeStoryId: null,
          phase: 'summary' as GamePhase,
          revealed: false,
          players: prev.players.filter((p) => p.connected).map((p) => ({ ...p, vote: null })),
        };
      }

      return {
        ...prev,
        stories,
        activeStoryId: next.id,
        revealed: false,
        round: prev.round + 1,
        players: prev.players.filter((p) => p.connected).map((p) => ({ ...p, vote: null })),
      };
    });
  }, [updateState]);

  const newSprint = useCallback(() => {
    updateState((prev) => ({
      ...prev,
      stories: prev.stories.map((s) => ({ ...s, average: null })),
      activeStoryId: null,
      phase: 'setup' as GamePhase,
      revealed: false,
      round: 1,
      players: prev.players.filter((p) => p.connected).map((p) => ({ ...p, vote: null })),
    }));
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
    error,
    addStory,
    removeStory,
    toggleStory,
    startVoting,
    nextStory,
    newSprint,
  };
}
