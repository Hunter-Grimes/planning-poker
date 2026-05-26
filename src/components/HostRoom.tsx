import { useState, useCallback } from 'react';
import { usePeerHost } from '../hooks/usePeerHost';
import { CardDeck } from './CardDeck';
import { PlayerList } from './PlayerList';
import { ResultsView } from './ResultsView';
import { CardValue } from '../types';

interface Props {
  hostName: string;
}

export function HostRoom({ hostName }: Props) {
  const { roomId, gameState, reveal, newRound, error } = usePeerHost(hostName);
  const [myVote, setMyVote] = useState<CardValue | null>(null);
  const [copied, setCopied] = useState(false);

  const handleVote = useCallback(
    (value: CardValue) => {
      if (gameState.revealed) return;
      setMyVote(value);
      // Update host's own vote directly in state via a ref trick isn't needed —
      // usePeerHost sets the host as a player; we patch it here by reflecting in UI only
      // and treating the host's vote locally (host doesn't send to itself over WebRTC)
    },
    [gameState.revealed],
  );

  const handleReveal = useCallback(() => {
    reveal();
  }, [reveal]);

  const handleNewRound = useCallback(() => {
    setMyVote(null);
    newRound();
  }, [newRound]);

  const copyCode = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Merge host's local vote into the displayed game state
  const displayState = {
    ...gameState,
    players: gameState.players.map((p) =>
      p.id === roomId ? { ...p, vote: myVote } : p,
    ),
  };

  const connectedCount = displayState.players.filter((p) => p.connected).length;
  const votedCount = displayState.players.filter((p) => p.connected && p.vote !== null).length;
  const allVoted = connectedCount > 0 && votedCount === connectedCount;

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-red-400">Connection error: {error}</p>
      </div>
    );
  }

  if (!roomId) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Creating room…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold">Planning Poker</h1>
            <p className="text-gray-400 text-sm">Round {gameState.round} · You're the host</p>
          </div>
          <span className="text-xs bg-gray-800 text-gray-400 px-3 py-1 rounded-full border border-gray-700">
            {connectedCount} player{connectedCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Join code */}
        {roomId && (
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 mb-6 text-center">
            <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Room code</p>
            <p className="text-4xl font-bold font-mono tracking-[0.2em] text-white mb-3">{roomId}</p>
            <button
              onClick={copyCode}
              className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-4 py-1.5 rounded-lg transition-colors"
            >
              {copied ? 'Copied!' : 'Copy code'}
            </button>
          </div>
        )}

        {/* Players */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Players ({votedCount}/{connectedCount} voted)
          </h2>
          <PlayerList gameState={displayState} myId={roomId} />
        </div>

        {/* Results */}
        {gameState.revealed && (
          <div className="mb-6">
            <ResultsView gameState={displayState} />
          </div>
        )}

        {/* Your cards */}
        {!gameState.revealed && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Your vote
            </h2>
            <CardDeck selected={myVote} onSelect={handleVote} disabled={gameState.revealed} />
          </div>
        )}

        {/* Host controls */}
        <div className="flex gap-3">
          {!gameState.revealed ? (
            <button
              onClick={handleReveal}
              disabled={votedCount === 0}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-xl py-3 transition-colors"
            >
              {allVoted ? 'Reveal Votes' : `Reveal Votes (${votedCount}/${connectedCount})`}
            </button>
          ) : (
            <button
              onClick={handleNewRound}
              className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold rounded-xl py-3 transition-colors"
            >
              New Round
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
