import { usePeerClient } from '../hooks/usePeerClient';
import { CardDeck } from './CardDeck';
import { PlayerList } from './PlayerList';
import { ResultsView } from './ResultsView';
import { CardValue } from '../types';

interface Props {
  roomId: string;
  playerName: string;
}

export function GuestRoom({ roomId, playerName }: Props) {
  const { gameState, status, vote, myId, error } = usePeerClient(roomId, playerName);

  const myPlayer = myId && gameState ? gameState.players.find((p) => p.id === myId) : null;
  const myVote = myPlayer?.vote ?? null;

  const handleVote = (value: CardValue) => {
    if (!gameState?.revealed) vote(value);
  };

  if (error || status === 'error') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-2">Could not connect to room.</p>
          <p className="text-gray-500 text-sm">The host may have closed the session.</p>
        </div>
      </div>
    );
  }

  if (status === 'disconnected') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Disconnected from room.</p>
      </div>
    );
  }

  if (status === 'connecting' || !gameState) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Connecting to room…</p>
      </div>
    );
  }

  const connectedCount = gameState.players.filter((p) => p.connected).length;
  const votedCount = gameState.players.filter((p) => p.connected && p.vote !== null).length;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold">Planning Poker</h1>
            <p className="text-gray-400 text-sm">Round {gameState.round}</p>
          </div>
          <span className="text-xs bg-gray-800 text-gray-400 px-3 py-1 rounded-full border border-gray-700">
            {connectedCount} player{connectedCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Players */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Players ({votedCount}/{connectedCount} voted)
          </h2>
          <PlayerList gameState={gameState} myId={myId} />
        </div>

        {/* Results */}
        {gameState.revealed && (
          <div className="mb-6">
            <ResultsView gameState={gameState} />
          </div>
        )}

        {/* Cards */}
        {!gameState.revealed ? (
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Your vote
            </h2>
            <CardDeck selected={myVote} onSelect={handleVote} />
          </div>
        ) : (
          <p className="text-center text-gray-500 text-sm mt-4">
            Waiting for host to start a new round…
          </p>
        )}
      </div>
    </div>
  );
}
