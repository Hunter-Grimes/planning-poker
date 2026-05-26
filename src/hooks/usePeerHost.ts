import { useEffect, useRef, useState, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { GameState, PeerMessage, Player } from '../types';

export interface UsePeerHostReturn {
  roomId: string | null;
  gameState: GameState;
  reveal: () => void;
  newRound: () => void;
  error: string | null;
}

export function usePeerHost(hostName: string): UsePeerHostReturn {
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState>({
    players: [],
    revealed: false,
    round: 1,
  });

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

  useEffect(() => {
    const peer = new Peer();
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
      connectionsRef.current.set(conn.peer, conn);

      conn.on('data', (raw) => {
        const msg = raw as PeerMessage;

        if (msg.type === 'join') {
          const newPlayer: Player = {
            id: conn.peer,
            name: msg.name,
            vote: null,
            connected: true,
          };
          setGameState((prev) => {
            const next: GameState = {
              ...prev,
              players: [...prev.players.filter((p) => p.id !== conn.peer), newPlayer],
            };
            // Send full state to all (including new joiner)
            const stateMsg: PeerMessage = { type: 'state', state: next };
            connectionsRef.current.forEach((c) => {
              if (c.open) c.send(stateMsg);
            });
            return next;
          });
        }

        if (msg.type === 'vote') {
          updateState((prev) => ({
            ...prev,
            players: prev.players.map((p) =>
              p.id === conn.peer ? { ...p, vote: msg.value } : p,
            ),
          }));
        }
      });

      conn.on('close', () => {
        connectionsRef.current.delete(conn.peer);
        updateState((prev) => ({
          ...prev,
          players: prev.players.map((p) =>
            p.id === conn.peer ? { ...p, connected: false } : p,
          ),
        }));
      });
    });

    return () => {
      peer.destroy();
    };
  }, [hostName, updateState]);

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

  return { roomId, gameState, reveal, newRound, error };
}
