export type CardValue = 1 | 2 | 3 | 5 | 8 | 13 | 21 | 34 | '?';

export const FIBONACCI_CARDS: CardValue[] = [1, 2, 3, 5, 8, 13, 21, 34, '?'];

export const MAX_NAME_LENGTH = 64;
export const MAX_COMPONENT_LABEL_LENGTH = 120;
export const MAX_PLAYERS = 10;

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

export interface Component {
  id: string;
  label: string;
  enabled: boolean;
  average: number | null;
}

export type GamePhase = 'voting' | 'summary';

export interface GameState {
  players: Player[];
  revealed: boolean;
  round: number;
  components: Component[];
  activeComponentId: string | null;
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
