export type CardValue = 1 | 2 | 3 | 5 | 8 | 13 | 21 | 34 | '?';

export const FIBONACCI_CARDS: CardValue[] = [1, 2, 3, 5, 8, 13, 21, 34, '?'];

export const MAX_NAME_LENGTH = 64;
export const MAX_PLAYERS = 10;

export interface Player {
  id: string;
  name: string;
  vote: CardValue | null;
  connected: boolean;
}

export interface Story {
  id: string;
  label: string;
  enabled: boolean;
  average: number | null;
}

export type GamePhase = 'setup' | 'voting' | 'summary';

export interface GameState {
  players: Player[];
  revealed: boolean;
  round: number;
  stories: Story[];
  activeStoryId: string | null;
  phase: GamePhase;
}

export interface PendingEntry {
  id: string;         // PeerJS peer ID
  name: string;
  persistentId: string;
}

export type PeerMessage =
  | { type: 'request-join'; name: string; persistentId: string }
  | { type: 'approved' }
  | { type: 'rejected'; reason: string }
  | { type: 'vote'; value: CardValue }
  | { type: 'reveal' }
  | { type: 'new-round' }
  | { type: 'state'; state: GameState };

export function isCardValue(v: unknown): v is CardValue {
  return FIBONACCI_CARDS.includes(v as CardValue);
}

export function isPeerMessage(raw: unknown): raw is PeerMessage {
  if (typeof raw !== 'object' || raw === null) return false;
  const msg = raw as Record<string, unknown>;
  switch (msg.type) {
    case 'request-join':
      return (
        typeof msg.name === 'string' &&
        msg.name.length >= 1 &&
        msg.name.length <= MAX_NAME_LENGTH &&
        typeof msg.persistentId === 'string' &&
        msg.persistentId.length > 0
      );
    case 'approved':
      return true;
    case 'rejected':
      return typeof msg.reason === 'string';
    case 'vote':
      return isCardValue(msg.value);
    case 'reveal':
    case 'new-round':
      return true;
    case 'state': {
      const s = msg.state as Record<string, unknown>;
      return (
        typeof s === 'object' &&
        s !== null &&
        Array.isArray(s.players) &&
        typeof s.revealed === 'boolean' &&
        typeof s.round === 'number'
      );
    }
    default:
      return false;
  }
}
