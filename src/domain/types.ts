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

// State deltas without their version stamp — the host builds these, then
// `emitDelta` adds the monotonic `version` before sending. `applyDelta` on the
// client consumes the stamped form (`StateDelta`).
export type StateDeltaBody =
  // A player cast (or changed) a vote — value stays hidden until reveal, so we
  // only flip their `hasVoted` flag. The voter shows their own value locally.
  | { type: 'voted'; id: string }
  // The host cleared a player's vote (guests can't clear; they re-vote).
  | { type: 'unvoted'; id: string }
  // A player started engaging with the deck this stage ("thinking" dot).
  | { type: 'player-active'; id: string }
  // Reveal: carries every connected voter's actual value so clients can show
  // results and compute the average/consensus.
  | { type: 'reveal'; votes: [string, CardValue][] }
  // A newly-approved player joined (sent to everyone *except* the joiner, who
  // gets a full snapshot instead).
  | { type: 'player-joined'; player: Player }
  // A player's connection dropped — they stay in the list, greyed out.
  | { type: 'player-disconnected'; id: string }
  // A player was kicked — removed from the list entirely.
  | { type: 'player-removed'; id: string };

export type StateDelta = StateDeltaBody & { version: number };

export type PeerMessage =
  // --- client → host -------------------------------------------------------
  | { type: 'request-join'; name: string; persistentId: string }
  | { type: 'vote'; value: CardValue }
  | { type: 'active' }
  // Sent when the client detects a version gap; host replies with a snapshot.
  | { type: 'request-resync' }
  // --- host → client (unversioned control) ---------------------------------
  | { type: 'approved' }
  | { type: 'rejected'; reason: string }
  // --- host → client (versioned state sync) --------------------------------
  // Full state — sent on join, on resync, and on structural transitions
  // (round/phase/component changes) where a delta would be fragile.
  | { type: 'snapshot'; version: number; state: GameState }
  | StateDelta;
