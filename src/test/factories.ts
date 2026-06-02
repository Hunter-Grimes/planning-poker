import { CardValue, GameState, Player, Story } from '../types';

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

export function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: overrides.id ?? nextId('peer'),
    name: overrides.name ?? 'Player',
    vote: overrides.vote ?? null,
    connected: overrides.connected ?? true,
    ...overrides,
  };
}

export function makeStory(overrides: Partial<Story> = {}): Story {
  return {
    id: overrides.id ?? nextId('story'),
    label: overrides.label ?? 'A story',
    enabled: overrides.enabled ?? true,
    average: overrides.average ?? null,
    ...overrides,
  };
}

export function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    players: overrides.players ?? [],
    revealed: overrides.revealed ?? false,
    round: overrides.round ?? 1,
    stories: overrides.stories ?? [],
    activeStoryId: overrides.activeStoryId ?? null,
    phase: overrides.phase ?? 'voting',
    hostId: overrides.hostId ?? null,
    ...overrides,
  };
}

/** A connected player who has cast `vote`. */
export function voter(name: string, vote: CardValue, overrides: Partial<Player> = {}): Player {
  return makePlayer({ name, vote, connected: true, ...overrides });
}
