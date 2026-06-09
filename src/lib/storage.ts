import { Component, PreferredHost } from '../domain/types';
import type { HostKeypair } from './hostIdentity';
import { randomId } from './id';

const HOST_KEY = 'pp_host';
const GUEST_KEY = 'pp_guest';
const COMPONENTS_KEY = 'pp_components';
const AUTO_REVEAL_KEY = 'pp_auto_reveal';
const CLIENT_ID_KEY = 'pp_client_id';
// Per-room preferred-host keypair, namespaced by room code.
const HOST_KEY_PREFIX = 'pp_host_key:';
// Per-room preferred-host identity (handle + optional pubkey). Persisted by
// *every* participant the first time they learn it, so that after everyone
// closes their tabs and a guest restarts to become a temporary host, that temp
// host still recognises — and yields to — the real creator when it returns.
const PREFERRED_PREFIX = 'pp_preferred:';

export interface HostSession {
  hostName: string;
  roomCode: string;
  approvedHandles: Record<string, string>; // roomHandle → name
}

export interface GuestSession {
  roomCode: string;
  playerName: string;
  persistentId: string;
}

// cyrb53 — a small, fast, well-distributed non-cryptographic hash. Used to
// derive a per-room handle from the (private) client id without pulling in
// SubtleCrypto (which is async and secure-context-only). The client id is
// 122-bit random, so the hash is not reversible to it, and mixing in the room
// code makes the handle uncorrelatable across rooms.
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function parseJSON<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const storage = {
  getHost(): HostSession | null {
    return parseJSON<HostSession>(localStorage.getItem(HOST_KEY));
  },
  saveHost(s: HostSession): void {
    localStorage.setItem(HOST_KEY, JSON.stringify(s));
  },
  clearHost(): void {
    localStorage.removeItem(HOST_KEY);
  },
  addApprovedHandle(handle: string, name: string): void {
    const s = this.getHost();
    if (!s) return;
    s.approvedHandles[handle] = name;
    this.saveHost(s);
  },
  removeApprovedHandle(handle: string): void {
    const s = this.getHost();
    if (!s) return;
    delete s.approvedHandles[handle];
    this.saveHost(s);
  },
  getGuest(): GuestSession | null {
    return parseJSON<GuestSession>(localStorage.getItem(GUEST_KEY));
  },
  saveGuest(s: GuestSession): void {
    localStorage.setItem(GUEST_KEY, JSON.stringify(s));
  },
  clearGuest(): void {
    localStorage.removeItem(GUEST_KEY);
  },
  getComponents(): Component[] {
    return parseJSON<Component[]>(localStorage.getItem(COMPONENTS_KEY)) ?? [];
  },
  saveComponents(components: Component[]): void {
    localStorage.setItem(COMPONENTS_KEY, JSON.stringify(components));
  },
  clearComponents(): void {
    localStorage.removeItem(COMPONENTS_KEY);
  },
  // Stable per-browser identity, minted once and reused for every join. This is
  // what lets a host auto-approve a returning guest: the host stores approved
  // ids, and this id only changes if the user clears their storage. Never
  // cleared by clearGuest()/clearHost() — losing it would force re-approval.
  getClientId(): string {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  },
  // Sticky host preference — survives closing a room and opening a new one, so
  // it isn't cleared alongside the host session.
  getAutoReveal(): boolean {
    return localStorage.getItem(AUTO_REVEAL_KEY) === 'true';
  },
  saveAutoReveal(value: boolean): void {
    localStorage.setItem(AUTO_REVEAL_KEY, value ? 'true' : 'false');
  },
  // Per-room, stable, non-reversible handle derived from the private client id.
  // The wire/approval identity used everywhere a peer id isn't appropriate;
  // distinct per room so a participant can't be correlated across rooms.
  getRoomHandle(roomCode: string): string {
    return cyrb53(`${this.getClientId()}|${roomCode}`).toString(36);
  },
  // Preferred-host keypair, kept per room so a returning creator can re-sign a
  // takeover. Cleared by Close Room (the room is destroyed), preserved on a
  // plain tab close (the room is meant to auto-restart).
  getHostKey(roomCode: string): HostKeypair | null {
    return parseJSON<HostKeypair>(localStorage.getItem(HOST_KEY_PREFIX + roomCode));
  },
  saveHostKey(roomCode: string, key: HostKeypair): void {
    localStorage.setItem(HOST_KEY_PREFIX + roomCode, JSON.stringify(key));
  },
  clearHostKey(roomCode: string): void {
    localStorage.removeItem(HOST_KEY_PREFIX + roomCode);
  },
  // Preferred-host identity, remembered per room by anyone who has seen it (the
  // invite-link key or a snapshot). Lets a returning guest-turned-temp-host
  // still verify the real creator's takeover after a full restart.
  getPreferredHost(roomCode: string): PreferredHost | null {
    return parseJSON<PreferredHost>(localStorage.getItem(PREFERRED_PREFIX + roomCode));
  },
  savePreferredHost(roomCode: string, pref: PreferredHost): void {
    localStorage.setItem(PREFERRED_PREFIX + roomCode, JSON.stringify(pref));
  },
  clearPreferredHost(roomCode: string): void {
    localStorage.removeItem(PREFERRED_PREFIX + roomCode);
  },
};
