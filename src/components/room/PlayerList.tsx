import { GameState, Player, playerHasVoted } from '../../domain/types';
import { getCardColors } from '../../domain/cardColors';
import { cn } from '../../lib/cn';

interface Props {
  gameState: GameState;
  myId: string | null;
  hostId: string | null;
  onKick?: (peerId: string) => void;
}

function PlayerCard({
  player,
  revealed,
  isMe,
  isHost,
  onKick,
}: {
  player: Player;
  revealed: boolean;
  isMe: boolean;
  isHost: boolean;
  onKick?: (peerId: string) => void;
}) {
  const hasVoted = playerHasVoted(player);
  const showKick = !!onKick && !isMe;
  const showVote = revealed && hasVoted;
  const showActive = !hasVoted && !!player.active;

  const bodyClass = showVote
    ? getCardColors(player.vote!).soft
    : showActive
      ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-500 dark:text-indigo-300'
      : 'bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400';

  return (
    <div
      className={cn(
        'relative w-28 h-36 rounded-2xl shadow-md flex flex-col items-center pt-3 pb-4',
        bodyClass,
        !player.connected && 'opacity-50',
      )}
    >
      {/* Name pill */}
      <div
        className={cn(
          'flex items-center gap-1 px-2.5 py-1 max-w-[90%] rounded-full shadow-sm text-xs font-medium',
          'bg-white dark:bg-gray-900',
          isMe
            ? 'text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-400 dark:ring-indigo-600'
            : 'text-gray-800 dark:text-gray-200',
        )}
      >
        {isHost && (
          <svg
            className="flex-none w-3 h-3 text-gray-500 dark:text-gray-400"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-label="Host"
            role="img"
          >
            <title>Host</title>
            <path d="M2.5 5.5l2 5h7l2-5-3 2-2.5-3.5-2.5 3.5-3-2z" />
          </svg>
        )}
        <span className="truncate" title={player.name}>
          {player.name}
        </span>
        {showKick && (
          <button
            onClick={() => onKick!(player.id)}
            title={`Remove ${player.name}`}
            aria-label={`Remove ${player.name}`}
            className="flex-none flex items-center justify-center w-4 h-4 rounded-full text-red-500 hover:text-white hover:bg-red-500 transition-colors"
          >
            <svg
              className="w-3 h-3"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
        )}
      </div>

      {/* Vote / state */}
      <div className="flex-1 flex items-center justify-center w-full">
        {showVote ? (
          <span className="text-5xl font-bold tabular-nums select-none">{String(player.vote)}</span>
        ) : hasVoted ? (
          <svg
            className="w-10 h-10 text-emerald-600 dark:text-emerald-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            role="img"
            aria-label={`${player.name} has voted`}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        ) : !player.connected ? (
          <span className="text-xs uppercase tracking-wide">offline</span>
        ) : showActive ? (
          <span
            className="text-3xl font-bold text-indigo-500 dark:text-indigo-300 animate-pulse"
            aria-label={`${player.name} is considering`}
          >
            …
          </span>
        ) : (
          <span
            className="text-3xl font-bold text-gray-400 dark:text-gray-600"
            aria-label={`${player.name} is waiting`}
          >
            …
          </span>
        )}
      </div>
    </div>
  );
}

export function PlayerList({ gameState, myId, hostId, onKick }: Props) {
  return (
    <div className="flex flex-wrap gap-3 justify-center">
      {gameState.players
        .filter((p) => p.connected || gameState.revealed)
        .map((player) => (
          <PlayerCard
            key={player.id}
            player={player}
            revealed={gameState.revealed}
            isMe={player.id === myId}
            isHost={player.id === hostId}
            onKick={onKick}
          />
        ))}
    </div>
  );
}
