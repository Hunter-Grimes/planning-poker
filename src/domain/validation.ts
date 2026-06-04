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

function isStringRecord(v: unknown): v is Record<string, string> {
  if (typeof v !== 'object' || v === null) return false;
  return Object.values(v as Record<string, unknown>).every((x) => typeof x === 'string');
}

function isPreferredHost(v: unknown): boolean {
  if (v === null) return true;
  if (typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  if (typeof p.handle !== 'string' || p.handle.length === 0) return false;
  if (p.pubKey !== null && typeof p.pubKey !== 'string') return false;
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
  if (!isPreferredHost(s.preferredHost)) return false;
  if (typeof s.migrationEpoch !== 'number' || !Number.isFinite(s.migrationEpoch)) return false;
  if (!isStringRecord(s.approvedHandles)) return false;
  return true;
}

export function isCardValue(v: unknown): v is CardValue {
  return (FIBONACCI_CARDS as readonly unknown[]).includes(v);
}

function isVersion(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

// Reveal payload: an array of [peerId, CardValue] pairs.
function isRevealVotes(v: unknown): v is [string, CardValue][] {
  return (
    Array.isArray(v) &&
    v.every(
      (e) => Array.isArray(e) && e.length === 2 && typeof e[0] === 'string' && isCardValue(e[1]),
    )
  );
}

export function isPeerMessage(raw: unknown): raw is PeerMessage {
  if (typeof raw !== 'object' || raw === null) return false;
  const msg = raw as Record<string, unknown>;
  switch (msg.type) {
    // --- client → host -----------------------------------------------------
    case 'request-join':
      return (
        typeof msg.name === 'string' &&
        msg.name.length >= 1 &&
        msg.name.length <= MAX_NAME_LENGTH &&
        typeof msg.handle === 'string' &&
        msg.handle.length > 0
      );
    case 'vote':
      return isCardValue(msg.value);
    case 'active':
    case 'request-resync':
      return true;
    case 'claim-host':
      return (
        isNonEmptyString(msg.handle) &&
        typeof msg.epoch === 'number' &&
        Number.isFinite(msg.epoch) &&
        isNonEmptyString(msg.nonce) &&
        // Bounded to keep a malicious peer from sending a huge string. A real
        // ECDSA P-256 signature is ~64 bytes → ~88 base64 chars.
        (msg.sig === null || (typeof msg.sig === 'string' && msg.sig.length <= 512))
      );
    // --- host → client (unversioned control) -------------------------------
    case 'approved':
    case 'room-closed':
      return true;
    case 'rejected':
      return typeof msg.reason === 'string';
    // --- host → client (versioned state sync) ------------------------------
    case 'snapshot':
      return isVersion(msg.version) && isGameState(msg.state);
    case 'voted':
    case 'unvoted':
    case 'player-active':
    case 'player-disconnected':
    case 'player-removed':
      return isVersion(msg.version) && isNonEmptyString(msg.id);
    case 'player-joined':
      return isVersion(msg.version) && isPlayer(msg.player);
    case 'reveal':
      return isVersion(msg.version) && isRevealVotes(msg.votes);
    default:
      return false;
  }
}
