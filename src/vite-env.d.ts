/// <reference types="vite/client" />

interface ImportMetaEnv {
  // URL that returns ICE servers (STUN + TURN), fetched at startup. For Metered
  // this is the credentials endpoint incl. its apiKey query param. See README.
  readonly VITE_ICE_ENDPOINT?: string;
  // Optional manually-configured TURN relay for WebRTC NAT traversal. See
  // src/peerConfig.ts. Usually unnecessary if VITE_ICE_ENDPOINT is set.
  readonly VITE_TURN_URL?: string;
  readonly VITE_TURN_USERNAME?: string;
  readonly VITE_TURN_CREDENTIAL?: string;
  // PeerJS log verbosity (0–3). See src/peerConfig.ts.
  readonly VITE_PEER_DEBUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
