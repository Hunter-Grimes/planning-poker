import { useEffect, useRef } from 'react';
import { usePeerClient } from '../hooks/usePeerClient';
import { CardDeck } from './CardDeck';
import { PlayerList } from './PlayerList';
import { ResultsView } from './ResultsView';
import { ThemeToggle } from './ThemeToggle';
import { CardValue } from '../types';
import { storage } from '../storage';

interface Props {
  roomId: string;
  playerName: string;
  persistentId: string;
  onLeave: () => void;
}

export function GuestRoom({ roomId, playerName, persistentId, onLeave }: Props) {
  const { gameState, status, vote, signalActive, myId, error } = usePeerClient(roomId, playerName, persistentId);

  const savedRef = useRef(false);

  useEffect(() => {
    if (status === 'connected' && !savedRef.current) {
      savedRef.current = true;
      storage.saveGuest({ roomCode: roomId, playerName, persistentId });
    }
  }, [status, roomId, playerName, persistentId]);

  useEffect(() => {
    if (status === 'error') {
      storage.clearGuest();
    }
  }, [status]);

  const myPlayer = myId && gameState ? gameState.players.find((p) => p.id === myId) : null;
  const myVote = myPlayer?.vote ?? null;

  const handleVote = (value: CardValue) => {
    if (!gameState?.revealed) vote(value);
  };

  const handleLeave = () => {
    storage.clearGuest();
    onLeave();
  };

  if (error || status === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-2">{error ?? 'Could not connect to room.'}</p>
          <p className="text-gray-500 dark:text-gray-500 text-sm mb-4">The host may have closed the session.</p>
          <button
            onClick={handleLeave}
            className="text-sm bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-4 py-2 rounded-lg transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (status === 'disconnected') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">Disconnected from room.</p>
          <button
            onClick={handleLeave}
            className="text-sm bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-4 py-2 rounded-lg transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (status === 'connecting') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400 animate-pulse">Connecting to room…</p>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400 animate-pulse">Waiting for host to approve your request…</p>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400 animate-pulse">Loading…</p>
      </div>
    );
  }

  const connectedCount = gameState.players.filter((p) => p.connected).length;
  const votedCount = gameState.players.filter(
    (p) => p.connected && (p.hasVoted ?? p.vote !== null),
  ).length;
  const activeStory = gameState.stories.find((s) => s.id === gameState.activeStoryId);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header card */}
        <div className="mb-6 flex items-center justify-between gap-3 flex-wrap bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 min-w-0">
            {gameState.phase === 'voting' ? (
              <>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-indigo-600 dark:text-indigo-400">
                  Round
                </span>
                <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white leading-none">
                  {gameState.round}
                </span>
              </>
            ) : (
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Estimate complete
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <ThemeToggle />
            <button
              onClick={handleLeave}
              className="text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-3 py-1 rounded-full border border-gray-300 dark:border-gray-700 transition-colors"
            >
              Leave
            </button>
          </div>
        </div>

        {/* Currently voting banner */}
        {gameState.phase === 'voting' && activeStory && (
          <div className="bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-3 mb-6">
            <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium uppercase tracking-wide mb-0.5">
              Currently voting
            </p>
            <p className="text-gray-900 dark:text-white font-semibold">{activeStory.label}</p>
          </div>
        )}

        {/* Players */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            {gameState.phase === 'voting'
              ? `${votedCount}/${connectedCount} voted`
              : `Players (${connectedCount})`}
          </h2>
          <PlayerList gameState={gameState} myId={myId} hostId={gameState.hostId} />
        </div>

        {/* Sprint summary */}
        {gameState.phase === 'summary' && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Estimate Summary
            </h2>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              {gameState.stories
                .filter((s) => s.enabled && s.average !== null)
                .map((story) => (
                  <div
                    key={story.id}
                    className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 last:border-0"
                  >
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate mr-4">{story.label}</span>
                    <span className="text-sm font-mono text-gray-900 dark:text-white flex-none">
                      {story.average!.toFixed(1)}
                    </span>
                  </div>
                ))}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-100 dark:bg-gray-800">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Total</span>
                <span className="text-sm font-mono font-bold text-gray-900 dark:text-white">
                  {gameState.stories
                    .filter((s) => s.enabled && s.average !== null)
                    .reduce((sum, s) => sum + s.average!, 0)
                    .toFixed(1)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {gameState.phase === 'voting' && gameState.revealed && (
          <div className="mb-6">
            <ResultsView gameState={gameState} />
          </div>
        )}

        {/* Cards / waiting messages */}
        {gameState.phase === 'voting' && !gameState.revealed && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Your vote
            </h2>
            <CardDeck
              selected={myVote}
              onSelect={handleVote}
              onActivate={signalActive}
              stageKey={`${gameState.round}-${gameState.activeStoryId ?? 'none'}`}
            />
          </div>
        )}
        {gameState.phase === 'voting' && gameState.revealed && (
          <p className="text-center text-gray-500 dark:text-gray-500 text-sm mt-4">
            Waiting for host to continue…
          </p>
        )}
        {gameState.phase === 'summary' && (
          <p className="text-center text-gray-500 dark:text-gray-500 text-sm mt-4">
            Waiting for host to start next ticket…
          </p>
        )}
      </div>
    </div>
  );
}
