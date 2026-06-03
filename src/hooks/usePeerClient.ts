import { useEffect, useRef, useState, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { CardValue, GameState, PeerMessage } from '../domain/types';
import { isPeerMessage } from '../domain/validation';
import { applyDelta } from '../domain/gameLogic';
import { getPeerConfig } from '../lib/peerConfig';

export type ConnectionStatus = 'connecting' | 'pending' | 'connected' | 'disconnected' | 'error';

export interface UsePeerClientReturn {
  gameState: GameState | null;
  status: ConnectionStatus;
  vote: (value: CardValue) => void;
  signalActive: () => void;
  myId: string | null;
  error: string | null;
}

export function usePeerClient(
  roomId: string,
  playerName: string,
  persistentId: string,
): UsePeerClientReturn {
  const connRef = useRef<DataConnection | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  // Mirror of myId for use inside stable callbacks (optimistic own-vote write).
  const myIdRef = useRef<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  // Last applied state version, and whether we've received an initial snapshot.
  // Deltas only apply when in lockstep (version === last + 1); any gap triggers
  // a resync request and the delta is dropped until a fresh snapshot arrives.
  const versionRef = useRef(0);
  const syncedRef = useRef(false);

  useEffect(() => {
    const peer = new Peer(getPeerConfig());
    peerRef.current = peer;

    // WebRTC can stall during ICE negotiation without ever firing 'open' or
    // 'error' — the guest would then sit on "Connecting…" forever. Guard the
    // initial handshake with a timeout that surfaces an actionable error, and
    // track the ICE state along the way so the logs can say *why* it stalled.
    const CONNECT_TIMEOUT_MS = 15000;
    let connectTimer: ReturnType<typeof setTimeout> | undefined;
    let lastIceState: RTCIceConnectionState | 'unknown' = 'unknown';
    const clearConnectTimer = () => {
      if (connectTimer !== undefined) {
        clearTimeout(connectTimer);
        connectTimer = undefined;
      }
    };

    peer.on('open', (id) => {
      setMyId(id);
      myIdRef.current = id;
      const conn = peer.connect(roomId, { reliable: true });
      connRef.current = conn;

      connectTimer = setTimeout(() => {
        if (connRef.current?.open) return; // channel opened in the meantime
        console.warn(
          `[usePeerClient] connect timed out (channelOpen=${conn.open}, iceState=${lastIceState})`,
        );
        setError(
          'Could not reach the host. The network may be blocking peer-to-peer ' +
            '(WebRTC) connections, or the host is no longer online.',
        );
        setStatus('error');
      }, CONNECT_TIMEOUT_MS);

      // PeerJS surfaces the underlying ICE state here — 'failed'/'disconnected'
      // or a stuck 'checking' is the signature of a network blocking P2P.
      conn.on('iceStateChanged', (state) => {
        lastIceState = state;
      });

      conn.on('open', () => {
        clearConnectTimer();
        setStatus('pending');
        const msg: PeerMessage = { type: 'request-join', name: playerName, persistentId };
        conn.send(msg);
      });

      conn.on('data', (raw) => {
        // Only trust data arriving on the host connection — peer-to-guest
        // direct connects are rejected below, but defense-in-depth here too.
        if (conn !== connRef.current) return;
        if (!isPeerMessage(raw)) return;

        switch (raw.type) {
          case 'approved':
            setStatus('connected');
            return;
          case 'rejected':
            setError(raw.reason);
            setStatus('error');
            return;
          case 'snapshot':
            versionRef.current = raw.version;
            syncedRef.current = true;
            setGameState(raw.state);
            return;
          // Everything else is a versioned state delta.
          case 'voted':
          case 'unvoted':
          case 'player-active':
          case 'reveal':
          case 'player-joined':
          case 'player-disconnected':
          case 'player-removed': {
            // Must have a base state and be exactly one version ahead. Any gap
            // (lost message, pre-snapshot delta) means we re-sync from scratch.
            if (!syncedRef.current || raw.version !== versionRef.current + 1) {
              if (conn.open) conn.send({ type: 'request-resync' } satisfies PeerMessage);
              return;
            }
            versionRef.current = raw.version;
            setGameState((prev) => (prev ? applyDelta(prev, raw) : prev));
            return;
          }
        }
      });

      conn.on('close', () => {
        clearConnectTimer();
        setStatus('disconnected');
      });
      conn.on('error', (err) => {
        clearConnectTimer();
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
      clearConnectTimer();
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
      clearConnectTimer();
      peer.destroy();
    };
  }, [roomId, playerName, persistentId]);

  const vote = useCallback((value: CardValue) => {
    if (connRef.current?.open) {
      const msg: PeerMessage = { type: 'vote', value };
      connRef.current.send(msg);
      // Optimistically reflect our own vote locally. The host echoes a `voted`
      // delta (which carries no value, to keep it secret), so without this our
      // own card wouldn't show as selected until reveal. `myVote` is derived
      // from gameState, and a new-round snapshot clears it again.
      const myId = myIdRef.current;
      if (myId) {
        setGameState((prev) =>
          prev
            ? {
                ...prev,
                players: prev.players.map((p) =>
                  p.id === myId ? { ...p, vote: value, hasVoted: true } : p,
                ),
              }
            : prev,
        );
      }
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
