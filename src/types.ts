export type CardValue = 1 | 2 | 3 | 5 | 8 | 13 | 21 | 34 | '?';

export const FIBONACCI_CARDS: CardValue[] = [1, 2, 3, 5, 8, 13, 21, 34, '?'];

export const MAX_NAME_LENGTH = 64;
export const MAX_STORY_LABEL_LENGTH = 120;
export const MAX_PLAYERS = 10;

// crypto.randomUUID is only exposed in secure contexts. Fall back to a
// Math.random-based id so plain-http intranets (a common planning-poker
// deployment) don't crash on app start.
export function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through
    }
  }
  // Not cryptographically secure, but adequate as a session-scoped opaque id.
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${rand()}-${rand()}-${rand()}-${Date.now().toString(36)}`;
}

export interface Player {
  id: string;
  name: string;
  vote: CardValue | null;
  connected: boolean;
  // Present on broadcasts from host so clients can show "voted" without
  // leaking the value before reveal. May be absent on the host's local state.
  hasVoted?: boolean;
  // True once the player has hovered any card in the current voting stage —
  // a one-shot "thinking about it" signal that resets when the stage changes.
  active?: boolean;
}

// Whether a player has voted, honouring the redaction contract: broadcasts to
// clients carry `hasVoted` (the value itself is hidden pre-reveal), while the
// host's local state only has `vote`. Prefer the explicit flag when present.
export function playerHasVoted(player: Player): boolean {
  return player.hasVoted ?? player.vote !== null;
}

export interface Story {
  id: string;
  label: string;
  enabled: boolean;
  average: number | null;
}

export type GamePhase = 'voting' | 'summary';

const GAME_PHASES: readonly GamePhase[] = ['voting', 'summary'];

function isGamePhase(v: unknown): v is GamePhase {
  return typeof v === 'string' && (GAME_PHASES as readonly string[]).includes(v);
}

function isPlayer(v: unknown): v is Player {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  if (typeof p.id !== 'string' || p.id.length === 0) return false;
  if (typeof p.name !== 'string' || p.name.length === 0 || p.name.length > MAX_NAME_LENGTH)
    return false;
  if (typeof p.connected !== 'boolean') return false;
  if (p.vote !== null && !isCardValue(p.vote)) return false;
  if (p.hasVoted !== undefined && typeof p.hasVoted !== 'boolean') return false;
  if (p.active !== undefined && typeof p.active !== 'boolean') return false;
  return true;
}

function isStory(v: unknown): v is Story {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  if (typeof s.id !== 'string' || s.id.length === 0) return false;
  if (typeof s.label !== 'string') return false;
  if (typeof s.enabled !== 'boolean') return false;
  if (s.average !== null && (typeof s.average !== 'number' || !Number.isFinite(s.average)))
    return false;
  return true;
}

function isGameState(v: unknown): v is GameState {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  if (!Array.isArray(s.players) || !s.players.every(isPlayer)) return false;
  if (typeof s.revealed !== 'boolean') return false;
  if (typeof s.round !== 'number' || !Number.isFinite(s.round)) return false;
  if (!Array.isArray(s.stories) || !s.stories.every(isStory)) return false;
  if (s.activeStoryId !== null && typeof s.activeStoryId !== 'string') return false;
  if (!isGamePhase(s.phase)) return false;
  if (s.hostId !== null && typeof s.hostId !== 'string') return false;
  return true;
}

export interface GameState {
  players: Player[];
  revealed: boolean;
  round: number;
  stories: Story[];
  activeStoryId: string | null;
  phase: GamePhase;
  // The host's peer id — explicitly threaded so the UI doesn't have to assume
  // it equals the room code, and clients can identify the host without props.
  hostId: string | null;
}

export interface PendingEntry {
  id: string; // PeerJS peer ID
  name: string;
  persistentId: string;
}

export type PeerMessage =
  | { type: 'request-join'; name: string; persistentId: string }
  | { type: 'approved' }
  | { type: 'rejected'; reason: string }
  | { type: 'vote'; value: CardValue }
  | { type: 'active' }
  | { type: 'reveal' }
  | { type: 'new-round' }
  | { type: 'state'; state: GameState };

export function isCardValue(v: unknown): v is CardValue {
  return (FIBONACCI_CARDS as readonly unknown[]).includes(v);
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
    case 'active':
    case 'reveal':
    case 'new-round':
      return true;
    case 'state':
      return isGameState(msg.state);
    default:
      return false;
  }
}
