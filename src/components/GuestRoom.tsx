import { useEffect, useRef } from 'react';
import { usePeerClient } from '../hooks/usePeerClient';
import { CardDeck } from './CardDeck';
import { PlayerList } from './PlayerList';
import { ResultsView } from './ResultsView';
import { ThemeToggle } from './ThemeToggle';
import { RoomHeader } from './RoomHeader';
import { VotingBanner } from './VotingBanner';
import { SprintSummary } from './SprintSummary';
import { CenteredMessage } from './CenteredMessage';
import { CardValue, playerHasVoted } from '../types';
import { storage } from '../storage';

interface Props {
  roomId: string;
  playerName: string;
  persistentId: string;
  onLeave: () => void;
}

export function GuestRoom({ roomId, playerName, persistentId, onLeave }: Props) {
  const { gameState, status, vote, signalActive, myId, error } = usePeerClient(
    roomId,
    playerName,
    persistentId,
  );

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
      <CenteredMessage>
        <p className="text-red-600 dark:text-red-400 mb-2">
          {error ?? 'Could not connect to room.'}
        </p>
        <p className="text-gray-500 dark:text-gray-500 text-sm mb-4">
          The host may have closed the session.
        </p>
        <button
          onClick={handleLeave}
          className="text-sm bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-4 py-2 rounded-lg transition-colors"
        >
          Back to Home
        </button>
      </CenteredMessage>
    );
  }

  if (status === 'disconnected') {
    return (
      <CenteredMessage>
        <p className="text-gray-600 dark:text-gray-400 mb-4">Disconnected from room.</p>
        <button
          onClick={handleLeave}
          className="text-sm bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-4 py-2 rounded-lg transition-colors"
        >
          Back to Home
        </button>
      </CenteredMessage>
    );
  }

  if (status === 'connecting') {
    return (
      <CenteredMessage>
        <p className="text-gray-600 dark:text-gray-400 animate-pulse">Connecting to room…</p>
      </CenteredMessage>
    );
  }

  if (status === 'pending') {
    return (
      <CenteredMessage>
        <p className="text-gray-600 dark:text-gray-400 animate-pulse">
          Waiting for host to approve your request…
        </p>
      </CenteredMessage>
    );
  }

  if (!gameState) {
    return (
      <CenteredMessage>
        <p className="text-gray-600 dark:text-gray-400 animate-pulse">Loading…</p>
      </CenteredMessage>
    );
  }

  const connectedCount = gameState.players.filter((p) => p.connected).length;
  const votedCount = gameState.players.filter((p) => p.connected && playerHasVoted(p)).length;
  const activeStory = gameState.stories.find((s) => s.id === gameState.activeStoryId);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <RoomHeader phase={gameState.phase} round={gameState.round}>
          <ThemeToggle />
          <button
            onClick={handleLeave}
            className="text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-3 py-1 rounded-full border border-gray-300 dark:border-gray-700 transition-colors"
          >
            Leave
          </button>
        </RoomHeader>

        {gameState.phase === 'voting' && activeStory && <VotingBanner label={activeStory.label} />}

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
        {gameState.phase === 'summary' && <SprintSummary stories={gameState.stories} />}

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
