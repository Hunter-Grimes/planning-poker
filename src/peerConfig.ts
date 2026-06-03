import type { PeerJSOption } from 'peerjs';

// PeerJS uses the public broker only for the signaling handshake; the actual
// game traffic flows over a direct WebRTC data channel. That channel needs ICE
// servers to traverse NAT. STUN alone covers same-network and many home setups,
// but connecting *across* networks (symmetric NAT, mobile data, strict
// firewalls) needs a TURN relay. We fetch ICE servers (STUN + TURN) at startup
// from VITE_ICE_ENDPOINT — e.g. Metered's front-end-safe credentials URL, whose
// apiKey is designed to be embedded client-side — and fall back to STUN-only
// whenever the endpoint is absent or unreachable, so same-network play still
// works in that case.

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

// URL that returns ICE servers (e.g. Metered's credentials endpoint, including
// its apiKey query param). When unset, we stay STUN-only.
const ICE_ENDPOINT = import.meta.env.VITE_ICE_ENDPOINT;
// How long to wait for the endpoint before giving up and rendering STUN-only.
const ICE_FETCH_TIMEOUT_MS = 3000;

// PeerJS log verbosity: 0 off, 1 errors, 2 +warnings, 3 +all. Set
// VITE_PEER_DEBUG=3 when reproducing a connection problem to capture the full
// signaling + ICE handshake in the browser console.
function debugLevel(): 0 | 1 | 2 | 3 {
  const raw = Number(import.meta.env.VITE_PEER_DEBUG);
  return raw === 1 || raw === 2 || raw === 3 ? raw : 0;
}

// Optional manually-configured TURN relay (e.g. a static provider), supplied at
// build time. Coexists with the VITE_ICE_ENDPOINT fetch — both are merged into
// the ICE list if present. Comma-separated VITE_TURN_URL lets one credential
// advertise several transports (udp/tcp/tls).
function staticTurnServers(): RTCIceServer[] {
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

// The ICE list currently in effect. Starts STUN-only (+ any static env TURN) and
// is upgraded in place once initPeerConfig() folds in the fetched ICE servers.
let currentIceServers: RTCIceServer[] = [...STUN_SERVERS, ...staticTurnServers()];

// An RTCIceServer is only usable if it has a non-empty `urls` (string or array).
// RTCPeerConnection throws on entries without it, so we filter the fetched list
// before it can reach `new Peer(...)`.
function hasUsableUrls(server: RTCIceServer): boolean {
  const urls = server?.urls;
  if (typeof urls === 'string') return urls.length > 0;
  return Array.isArray(urls) && urls.length > 0;
}

// Synchronous accessor used by the peer hooks at Peer-construction time. Returns
// whatever ICE servers are known *now* — call initPeerConfig() before rendering
// so the relay credentials are already folded in by the time a room opens.
export function getPeerConfig(): PeerJSOption {
  return {
    debug: debugLevel(),
    config: { iceServers: currentIceServers },
  };
}

// Fetch ICE servers (STUN + TURN) from the endpoint and merge them into the
// active list. Never throws: on any failure we keep STUN-only so same-network
// play still works. Call once at startup, before the first render.
//
// Accepts either Metered's bare array shape — [{ urls }, { urls, username,
// credential }, …] — or a wrapped { iceServers: [...] } object, so the endpoint
// can be Metered directly or a custom service.
export async function initPeerConfig(): Promise<void> {
  if (!ICE_ENDPOINT) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ICE_FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(ICE_ENDPOINT, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`ICE endpoint returned ${res.status}`);
    const data = (await res.json()) as RTCIceServer[] | { iceServers?: RTCIceServer[] };
    const fetched = Array.isArray(data) ? data : data.iceServers;
    if (!Array.isArray(fetched)) {
      throw new Error('ICE endpoint returned no servers');
    }
    // Drop malformed entries — an iceServer without `urls` throws inside
    // RTCPeerConnection, which would otherwise surface at `new Peer(...)`.
    const usable = fetched.filter(hasUsableUrls);
    if (usable.length === 0) {
      throw new Error('ICE endpoint returned no usable servers');
    }
    currentIceServers = [...STUN_SERVERS, ...staticTurnServers(), ...usable];
  } catch (e) {
    console.warn('[peerConfig] ICE fetch failed; falling back to STUN-only:', e);
  }
}
