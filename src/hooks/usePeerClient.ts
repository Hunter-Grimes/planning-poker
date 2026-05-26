import { useEffect, useRef, useState, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { CardValue, GameState, PeerMessage, isPeerMessage } from '../types';

export type ConnectionStatus = 'connecting' | 'pending' | 'connected' | 'disconnected' | 'error';

export interface UsePeerClientReturn {
  gameState: GameState | null;
  status: ConnectionStatus;
  vote: (value: CardValue) => void;
  myId: string | null;
  error: string | null;
}

export function usePeerClient(roomId: string, playerName: string, persistentId: string): UsePeerClientReturn {
  const connRef = useRef<DataConnection | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => {
      setMyId(id);
      const conn = peer.connect(roomId, { reliable: true });
      connRef.current = conn;

      conn.on('open', () => {
        setStatus('pending');
        const msg: PeerMessage = { type: 'request-join', name: playerName, persistentId };
        conn.send(msg);
      });

      conn.on('data', (raw) => {
        if (!isPeerMessage(raw)) return;
        if (raw.type === 'state') setGameState(raw.state);
        if (raw.type === 'approved') setStatus('connected');
        if (raw.type === 'rejected') {
          setError(raw.reason);
          setStatus('error');
        }
      });

      conn.on('close', () => setStatus('disconnected'));
      conn.on('error', (err) => {
        setError(err.message);
        setStatus('error');
      });
    });

    peer.on('error', (err) => {
      setError(err.message);
      setStatus('error');
    });

    return () => {
      peer.destroy();
    };
  }, [roomId, playerName, persistentId]);

  const vote = useCallback((value: CardValue) => {
    if (connRef.current?.open) {
      const msg: PeerMessage = { type: 'vote', value };
      connRef.current.send(msg);
    }
  }, []);

  return { gameState, status, vote, myId, error };
}
