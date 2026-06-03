/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Optional TURN relay for WebRTC NAT traversal. See src/peerConfig.ts.
  readonly VITE_TURN_URL?: string;
  readonly VITE_TURN_USERNAME?: string;
  readonly VITE_TURN_CREDENTIAL?: string;
  // PeerJS log verbosity (0–3). See src/peerConfig.ts.
  readonly VITE_PEER_DEBUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
