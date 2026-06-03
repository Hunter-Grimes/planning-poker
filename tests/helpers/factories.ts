import { CardValue, GameState, Player, Component } from '../../src/domain/types';

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

export function makeComponent(overrides: Partial<Component> = {}): Component {
  return {
    id: overrides.id ?? nextId('component'),
    label: overrides.label ?? 'A component',
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
    components: overrides.components ?? [],
    activeComponentId: overrides.activeComponentId ?? null,
    phase: overrides.phase ?? 'voting',
    hostId: overrides.hostId ?? null,
    ...overrides,
  };
}

/** A connected player who has cast `vote`. */
export function voter(name: string, vote: CardValue, overrides: Partial<Player> = {}): Player {
  return makePlayer({ name, vote, connected: true, ...overrides });
}
