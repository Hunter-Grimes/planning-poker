import type { PeerJSOption } from 'peerjs';

// PeerJS uses the public broker only for the signaling handshake; the actual
// game traffic flows over a direct WebRTC data channel. That channel needs ICE
// servers to traverse NAT. PeerJS's default ships a single STUN server and no
// TURN relay, so a guest can reach the broker (and see the host's room exist)
// yet never open the data channel — the classic "works on the same wifi, fails
// across networks" symptom. We widen the STUN pool and, when configured, add a
// TURN relay, which is the only path that survives symmetric NAT / strict
// corporate firewalls.

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

// Optional TURN relay, supplied at build time via Vite env vars. Without it,
// connections that genuinely require relaying still fail — see the README for
// how to provision one. Comma-separated VITE_TURN_URL lets a provider advertise
// several transports (udp/tcp/tls) under one credential.
function turnServers(): RTCIceServer[] {
  const urls = import.meta.env.VITE_TURN_URL;
  if (!urls) return [];
  return [
    {
      urls: urls.split(',').map((u) => u.trim()),
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    },
  ];
}

// PeerJS log verbosity: 0 off, 1 errors, 2 +warnings, 3 +all. Set
// VITE_PEER_DEBUG=3 when reproducing a connection problem to capture the full
// signaling + ICE handshake in the browser console.
function debugLevel(): 0 | 1 | 2 | 3 {
  const raw = Number(import.meta.env.VITE_PEER_DEBUG);
  return raw === 1 || raw === 2 || raw === 3 ? raw : 0;
}

export const peerConfig: PeerJSOption = {
  debug: debugLevel(),
  config: {
    iceServers: [...STUN_SERVERS, ...turnServers()],
  },
};
