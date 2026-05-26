import { Story } from './types';

const HOST_KEY = 'pp_host';
const GUEST_KEY = 'pp_guest';
const STORIES_KEY = 'pp_stories';

export interface HostSession {
  hostName: string;
  roomCode: string;
  approvedPlayers: Record<string, string>; // persistentId → name
}

export interface GuestSession {
  roomCode: string;
  playerName: string;
  persistentId: string;
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
  addApprovedPlayer(persistentId: string, name: string): void {
    const s = this.getHost();
    if (!s) return;
    s.approvedPlayers[persistentId] = name;
    this.saveHost(s);
  },
  removeApprovedPlayer(persistentId: string): void {
    const s = this.getHost();
    if (!s) return;
    delete s.approvedPlayers[persistentId];
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
  getStories(): Story[] {
    return parseJSON<Story[]>(localStorage.getItem(STORIES_KEY)) ?? [];
  },
  saveStories(stories: Story[]): void {
    localStorage.setItem(STORIES_KEY, JSON.stringify(stories));
  },
  clearStories(): void {
    localStorage.removeItem(STORIES_KEY);
  },
};
