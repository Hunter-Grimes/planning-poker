import { useEffect, useRef } from 'react';
import { usePeerClient } from '../../hooks/usePeerClient';
import {
  CardDeck,
  PlayerList,
  ResultsView,
  RoomHeader,
  TicketSummary,
  VotingBanner,
} from '../room';
import {
  Button,
  CenteredMessage,
  PillButton,
  RoomScreen,
  SectionHeading,
  ThemeToggle,
} from '../ui';
import { CardValue, playerHasVoted } from '../../domain/types';
import { storage } from '../../lib/storage';

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
        <Button variant="secondary" onClick={handleLeave}>
          Back to Home
        </Button>
      </CenteredMessage>
    );
  }

  if (status === 'disconnected') {
    return (
      <CenteredMessage>
        <p className="text-gray-600 dark:text-gray-400 mb-4">Disconnected from room.</p>
        <Button variant="secondary" onClick={handleLeave}>
          Back to Home
        </Button>
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
  const activeComponent = gameState.components.find((s) => s.id === gameState.activeComponentId);

  return (
    <RoomScreen>
      <RoomHeader phase={gameState.phase} round={gameState.round}>
        <ThemeToggle />
        <PillButton variant="subtle" onClick={handleLeave}>
          Leave
        </PillButton>
      </RoomHeader>

      {gameState.phase === 'voting' && activeComponent && (
        <VotingBanner label={activeComponent.label} />
      )}

      {/* Players */}
      <div className="mb-6">
        <SectionHeading>
          {gameState.phase === 'voting'
            ? `${votedCount}/${connectedCount} voted`
            : `Players (${connectedCount})`}
        </SectionHeading>
        <PlayerList gameState={gameState} myId={myId} hostId={gameState.hostId} />
      </div>

      {/* Ticket summary */}
      {gameState.phase === 'summary' && <TicketSummary components={gameState.components} />}

      {/* Results */}
      {gameState.phase === 'voting' && gameState.revealed && (
        <div className="mb-6">
          <ResultsView gameState={gameState} />
        </div>
      )}

      {/* Cards / waiting messages */}
      {gameState.phase === 'voting' && !gameState.revealed && (
        <div>
          <SectionHeading>Your vote</SectionHeading>
          <CardDeck
            selected={myVote}
            onSelect={handleVote}
            onActivate={signalActive}
            stageKey={`${gameState.round}-${gameState.activeComponentId ?? 'none'}`}
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
    </RoomScreen>
  );
}
