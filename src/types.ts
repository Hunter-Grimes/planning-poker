export type CardValue = 1 | 2 | 3 | 5 | 8 | 13 | 21 | '?';

export const FIBONACCI_CARDS: CardValue[] = [1, 2, 3, 5, 8, 13, 21, '?'];

export interface Player {
  id: string;
  name: string;
  vote: CardValue | null;
  connected: boolean;
}

export interface GameState {
  players: Player[];
  revealed: boolean;
  round: number;
}

export type PeerMessage =
  | { type: 'join'; name: string }
  | { type: 'vote'; value: CardValue }
  | { type: 'reveal' }
  | { type: 'new-round' }
  | { type: 'state'; state: GameState };
