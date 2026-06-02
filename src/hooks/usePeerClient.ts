import { useEffect, useRef, useState, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { CardValue, GameState, PeerMessage, isPeerMessage } from '../types';

export type ConnectionStatus = 'connecting' | 'pending' | 'connected' | 'disconnected' | 'error';

export interface UsePeerClientReturn {
  gameState: GameState | null;
  status: ConnectionStatus;
  vote: (value: CardValue) => void;
  signalActive: () => void;
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
        // Only trust data arriving on the host connection — peer-to-guest
        // direct connects are rejected below, but defense-in-depth here too.
        if (conn !== connRef.current) return;
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

    // Reject incoming P2P connections from anyone other than the host. Other
    // guests should never be able to push state/messages to us directly.
    peer.on('connection', (incoming) => {
      incoming.on('open', () => {
        try {
          incoming.close();
        } catch {
          // best-effort
        }
      });
    });

    peer.on('error', (err) => {
      setError(err.message);
      setStatus('error');
    });

    peer.on('disconnected', () => {
      // Try to recover signaling so the client can keep receiving host updates.
      if (!peer.destroyed) {
        try {
          peer.reconnect();
        } catch (e) {
          console.warn('[usePeerClient] reconnect failed:', e);
        }
      }
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

  const signalActive = useCallback(() => {
    if (connRef.current?.open) {
      const msg: PeerMessage = { type: 'active' };
      connRef.current.send(msg);
    }
  }, []);

  return { gameState, status, vote, signalActive, myId, error };
}
