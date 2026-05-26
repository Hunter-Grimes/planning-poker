import { GameState, Player } from '../types';
import { getCardColors } from '../cardColors';

interface Props {
  gameState: GameState;
  myId: string | null;
  onKick?: (peerId: string) => void;
}

function PlayerRow({
  player,
  revealed,
  isMe,
  onKick,
}: {
  player: Player;
  revealed: boolean;
  isMe: boolean;
  onKick?: (peerId: string) => void;
}) {
  const hasVoted = player.vote !== null;

  return (
    <div
      className={[
        'flex items-center justify-between px-4 py-3 rounded-xl border',
        player.connected
          ? 'bg-gray-800 border-gray-700'
          : 'bg-gray-900 border-gray-800 opacity-50',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-200">
          {player.name}
          {isMe && <span className="ml-1 text-xs text-indigo-400">(you)</span>}
        </span>
        {!player.connected && <span className="text-xs text-gray-500">disconnected</span>}
      </div>

      <div className="flex items-center gap-2">
        {onKick && !isMe && (
          <button
            onClick={() => onKick(player.id)}
            title="Remove player"
            className="text-gray-600 hover:text-red-400 transition-colors text-lg leading-none"
          >
            ×
          </button>
        )}

        <div className="w-10 h-14 rounded-lg flex items-center justify-center text-sm font-bold border-2 transition-all">
          {revealed && hasVoted ? (
            <span className={`${getCardColors(player.vote!).chip} text-white w-full h-full rounded-lg flex items-center justify-center`}>
              {String(player.vote)}
            </span>
          ) : hasVoted ? (
            <span className="bg-emerald-700 border-emerald-500 text-emerald-200 w-full h-full rounded-lg flex items-center justify-center text-xs">
              ✓
            </span>
          ) : (
            <span className="bg-gray-700 border-gray-600 text-gray-500 w-full h-full rounded-lg flex items-center justify-center text-xs">
              …
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function PlayerList({ gameState, myId, onKick }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {gameState.players
        .filter((p) => p.connected || gameState.revealed)
        .map((player) => (
          <PlayerRow
            key={player.id}
            player={player}
            revealed={gameState.revealed}
            isMe={player.id === myId}
            onKick={onKick}
          />
        ))}
    </div>
  );
}
