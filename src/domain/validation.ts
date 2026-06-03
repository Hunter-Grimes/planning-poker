import {
  CardValue,
  Component,
  FIBONACCI_CARDS,
  GamePhase,
  GameState,
  MAX_NAME_LENGTH,
  PeerMessage,
  Player,
} from './types';

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

function isComponent(v: unknown): v is Component {
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
  if (!Array.isArray(s.components) || !s.components.every(isComponent)) return false;
  if (s.activeComponentId !== null && typeof s.activeComponentId !== 'string') return false;
  if (!isGamePhase(s.phase)) return false;
  if (s.hostId !== null && typeof s.hostId !== 'string') return false;
  return true;
}

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
