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

  // Keep options current without causing effect re-runs
  const optionsRef = useRef(options);
  optionsRef.current = options;

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

  const broadcast = useCallback((state: GameState) => {
    const msg: PeerMessage = { type: 'state', state };
    connectionsRef.current.forEach((conn) => {
      if (conn.open) conn.send(msg);
    });
  }, []);

  const updateState = useCallback(
    (updater: (prev: GameState) => GameState) => {
      setGameState((prev) => {
        const next = updater(prev);
        broadcast(next);
        return next;
      });
    },
    [broadcast],
  );

  // Shared approval logic — callable from both auto-approve and manual approve paths
  const doApprove = useCallback(
    (conn: DataConnection, peerId: string, persistentId: string, name: string) => {
      connectionsRef.current.set(peerId, conn);
      peerToPersistentIdRef.current.set(peerId, persistentId);

      const newPlayer: Player = { id: peerId, name, vote: null, connected: true };

      setGameState((prev) => {
        const next: GameState = {
          ...prev,
          players: [...prev.players.filter((p) => p.id !== peerId), newPlayer],
        };
        if (conn.open) {
          conn.send({ type: 'approved' } as PeerMessage);
          conn.send({ type: 'state', state: next } as PeerMessage);
        }
        connectionsRef.current.forEach((c) => {
          if (c.open && c !== conn) c.send({ type: 'state', state: next } as PeerMessage);
        });
        return next;
      });

      optionsRef.current.onApprove?.(persistentId, name);
    },
    [],
  );

  // Keep doApprove stable via ref so data-handler closures stay current
  const doApproveRef = useRef(doApprove);
  doApproveRef.current = doApprove;

  useEffect(() => {
    const code = optionsRef.current.roomCode ?? generateRoomCode();
    const peer = new Peer(code);
    peerRef.current = peer;

    peer.on('open', (id) => {
      setRoomId(id);
      setGameState((prev) => ({
        ...prev,
        players: [{ id, name: hostName, vote: null, connected: true }],
      }));
    });

    peer.on('error', (err) => setError(err.message));

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

          if (optionsRef.current.approvedPlayers?.[persistentId] !== undefined) {
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

    return () => {
      peer.destroy();
    };
  }, [hostName, updateState]);

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
      optionsRef.current.onKick?.(persistentId);
    }
  }, [updateState]);

  const castHostVote = useCallback(
    (value: CardValue | null) => {
      setGameState((prev) => {
        const next: GameState = {
          ...prev,
          players: prev.players.map((p) =>
            p.id === peerRef.current?.id ? { ...p, vote: value } : p,
          ),
        };
        broadcast(next);
        return next;
      });
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
      players: prev.players.map((p) => ({ ...p, vote: null })),
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
        players: prev.players.map((p) => ({ ...p, vote: null })),
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
          players: prev.players.map((p) => ({ ...p, vote: null })),
        };
      }

      return {
        ...prev,
        stories,
        activeStoryId: next.id,
        revealed: false,
        round: prev.round + 1,
        players: prev.players.map((p) => ({ ...p, vote: null })),
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
      players: prev.players.map((p) => ({ ...p, vote: null })),
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
