import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/index.css';
import { App } from './App';
import { initPeerConfig } from '../lib/peerConfig';

// Resolve ICE servers (if VITE_ICE_ENDPOINT is configured) before the first
// render, so a room opened immediately on load — e.g. a guest arriving via a
// ?room= invite link — already has the TURN relay available. initPeerConfig
// never rejects and is time-boxed, so a slow/absent endpoint just falls back to
// STUN-only.
function render() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

initPeerConfig().finally(render);
