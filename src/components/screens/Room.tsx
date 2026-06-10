import { useCallback, useEffect, useRef, useState } from 'react';
import { useRoom, RoomIntent } from '../../hooks/useRoom';
import {
  CardDeck,
  ComponentList,
  PlayerList,
  ResultsView,
  RoomHeader,
  TicketSummary,
  VotingBanner,
} from '../room';
import {
  BUTTON_VARIANTS,
  Button,
  CenteredMessage,
  PillButton,
  RoomScreen,
  SectionHeading,
  ThemeToggle,
} from '../ui';
import { CardValue, playerHasVoted } from '../../domain/types';
import { nextComponentAfterActive } from '../../domain/gameLogic';
import { cn } from '../../lib/cn';
import { storage } from '../../lib/storage';
import { logEnabled, ppLog } from '../../lib/logger';

interface Props {
  roomCode: string;
  playerName: string;
  intent: RoomIntent;
  pinnedPubKey?: string | null;
  onExit: () => void;
}

export function Room({ roomCode, playerName, intent, pinnedPubKey, onExit }: Props) {
  const {
    role,
    isPreferredHost,
    myId,
    gameState,
    status,
    stalled,
    pendingPlayers,
    error,
    migrationNotice,
    vote,
    signalActive,
    reveal,
    newRound,
    restartRound,
    approvePlayer,
    denyPlayer,
    kickPlayer,
    addComponent,
    removeComponent,
    toggleComponent,
    renameComponent,
    nextComponent,
    newTicket,
    closeRoom,
  } = useRoom({ roomCode, playerName, intent, pinnedPubKey });

  const isHost = role === 'host';

  const [copied, setCopied] = useState(false);
  const [debugCopied, setDebugCopied] = useState(false);
  const [autoReveal, setAutoReveal] = useState(() => storage.getAutoReveal());
  const [backlogOpen, setBacklogOpen] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist a guest session so a reload rejoins (and so a promoted temp host
  // still reloads as a guest). The preferred host's session is saved by the hook.
  useEffect(() => {
    if (status === 'connected' && !isPreferredHost) {
      storage.saveGuest({ roomCode, playerName, persistentId: storage.getClientId() });
    }
  }, [status, isPreferredHost, roomCode, playerName]);

  useEffect(() => {
    if (isHost) storage.saveAutoReveal(autoReveal);
  }, [isHost, autoReveal]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleVote = useCallback(
    (value: CardValue) => {
      if (gameState?.revealed) return;
      vote(value);
    },
    [gameState?.revealed, vote],
  );

  const handleExit = () => {
    if (isHost) closeRoom();
    storage.clearGuest();
    onExit();
  };

  const connectedCount = gameState
    ? gameState.players.filter((p) => p.connected).length
    : 0;
  const votedCount = gameState
    ? gameState.players.filter((p) => p.connected && playerHasVoted(p)).length
    : 0;
  const allVoted = connectedCount > 0 && votedCount === connectedCount;

  useEffect(() => {
    if (isHost && autoReveal && allVoted && gameState && !gameState.revealed && gameState.phase === 'voting') {
      reveal();
    }
  }, [isHost, autoReveal, allVoted, gameState, reveal]);

  // --- connection states ---
  if (error || status === 'error') {
    return (
      <CenteredMessage>
        <p className="text-red-600 dark:text-red-400 mb-2">{error ?? 'Connection error.'}</p>
        <p className="text-gray-500 dark:text-gray-500 text-sm mb-4">
          The room may have closed, or the host is offline.
        </p>
        <Button variant="secondary" onClick={handleExit}>
          Back to Home
        </Button>
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
        <p className="text-gray-600 dark:text-gray-400 animate-pulse">
          {stalled ? 'Still trying to reach the room…' : 'Connecting to room…'}
        </p>
        {stalled && (
          <>
            <p className="text-gray-500 dark:text-gray-500 text-sm mt-2 mb-4">
              The host may be offline. We'll keep trying — wait here, or head back and rejoin later.
            </p>
            <Button variant="secondary" onClick={handleExit}>
              Back to Home
            </Button>
          </>
        )}
      </CenteredMessage>
    );
  }

  const activeComponent = gameState.components.find((s) => s.id === gameState.activeComponentId);
  const myVote = myId ? (gameState.players.find((p) => p.id === myId)?.vote ?? null) : null;
  const hasMoreComponents = nextComponentAfterActive(gameState) !== null;
  const willSummarize =
    gameState.activeComponentId !== null ||
    gameState.components.some((s) => s.enabled && s.average !== null);

  const copyInvite = async () => {
    const pub = gameState.preferredHost?.pubKey;
    const link = `${window.location.origin}${window.location.pathname}?room=${roomCode}${
      pub ? `#k=${pub}` : ''
    }`;
    const showCopied = () => {
      setCopied(true);
      if (copyTimeoutRef.current !== null) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        copyTimeoutRef.current = null;
      }, 2000);
    };
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        showCopied();
        return;
      }
    } catch {
      /* fall through */
    }
    showCopied();
  };

  return (
    <RoomScreen fill={isHost}>
      <RoomHeader phase={gameState.phase} round={gameState.round}>
        {isHost && (
          <PillButton
            variant={copied ? 'success' : 'neutral'}
            onClick={copyInvite}
            title="Copy invite link"
            aria-label={copied ? 'Invite link copied' : 'Copy invite link'}
            aria-live="polite"
          >
            {copied ? (
              <span className="font-semibold tracking-wide">Link copied</span>
            ) : (
              <span className="font-mono font-semibold tracking-[0.15em] text-gray-900 dark:text-white">
                {roomCode}
              </span>
            )}
          </PillButton>
        )}
        <ThemeToggle />
        {isHost ? (
          <PillButton variant="dangerHover" onClick={handleExit} title="Close Room">
            Close Room
          </PillButton>
        ) : (
          <PillButton variant="subtle" onClick={handleExit}>
            Leave
          </PillButton>
        )}
      </RoomHeader>

      {/* Temporary-host / migration indicator */}
      {isHost && !isPreferredHost && (
        <p className="text-center text-xs text-amber-600 dark:text-amber-400 mb-3">
          You're temporarily hosting this room — control returns to the original host when they
          rejoin.
        </p>
      )}
      {migrationNotice && (
        <p className="text-center text-xs text-amber-600 dark:text-amber-400 mb-3">
          ⚠ {migrationNotice}
        </p>
      )}

      {gameState.phase === 'voting' && activeComponent && (
        <VotingBanner label={activeComponent.label} />
      )}

      {/* Pending approvals (host only) */}
      {isHost && pendingPlayers.length > 0 && (
        <div className="mb-6">
          <SectionHeading tone="warning">Waiting to join ({pendingPlayers.length})</SectionHeading>
          <div className="flex flex-col gap-2">
            {pendingPlayers.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between px-4 py-3 rounded-xl border bg-yellow-50 dark:bg-gray-900 border-yellow-300 dark:border-yellow-700"
              >
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {p.name}
                </span>
                <div className="flex gap-2">
                  <Button variant="success" size="sm" onClick={() => approvePlayer(p.id)}>
                    Approve
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => denyPlayer(p.id)}>
                    Deny
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Players */}
      <div className="mb-6">
        <SectionHeading>
          {gameState.phase === 'voting'
            ? `${votedCount}/${connectedCount} voted`
            : `Players (${connectedCount})`}
        </SectionHeading>
        <PlayerList
          gameState={gameState}
          myId={myId}
          hostId={gameState.hostId}
          onKick={isHost ? kickPlayer : undefined}
        />
      </div>

      {gameState.phase === 'summary' && <TicketSummary components={gameState.components} />}

      {gameState.phase === 'voting' && gameState.revealed && (
        <div className="mb-6">
          <ResultsView gameState={gameState} />
        </div>
      )}

      {/* Cards */}
      {gameState.phase === 'voting' && !gameState.revealed && (
        <div className="mb-6">
          <SectionHeading>Your vote</SectionHeading>
          <CardDeck
            selected={myVote}
            onSelect={handleVote}
            onActivate={signalActive}
            stageKey={`${gameState.round}-${gameState.activeComponentId ?? 'none'}`}
          />
        </div>
      )}

      {/* Waiting messages (guest) */}
      {!isHost && gameState.phase === 'voting' && gameState.revealed && (
        <p className="text-center text-gray-500 dark:text-gray-500 text-sm mt-4">
          Waiting for host to continue…
        </p>
      )}
      {!isHost && gameState.phase === 'summary' && (
        <p className="text-center text-gray-500 dark:text-gray-500 text-sm mt-4">
          Waiting for host to start next ticket…
        </p>
      )}

      {/* Component list (host only) */}
      {isHost && gameState.phase !== 'summary' && (
        <div className="mb-6">
          <ComponentList
            components={gameState.components}
            activeComponentId={gameState.activeComponentId}
            phase={gameState.phase}
            revealed={gameState.revealed}
            open={backlogOpen}
            onOpenChange={setBacklogOpen}
            onAdd={addComponent}
            onRemove={removeComponent}
            onToggle={toggleComponent}
            onRename={renameComponent}
          />
        </div>
      )}

      {/* Controls (host only) */}
      {isHost && (
        <div className="flex gap-3 mt-auto pt-6">
          {gameState.phase === 'voting' && !gameState.revealed && (
            <>
              <Button
                variant="secondary"
                size="lg"
                onClick={restartRound}
                disabled={votedCount === 0}
                title="Reset all votes and restart this round"
              >
                Restart
              </Button>
              <div className="flex flex-1 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={reveal}
                  disabled={votedCount === 0}
                  className={cn(
                    'flex-1 py-3 font-semibold transition-colors',
                    BUTTON_VARIANTS.primary,
                  )}
                >
                  {allVoted ? 'Reveal Votes' : `Reveal Votes (${votedCount}/${connectedCount})`}
                </button>
                <button
                  onClick={() => setAutoReveal((v) => !v)}
                  title={autoReveal ? 'Auto-reveal is on — turn off' : 'Auto-reveal is off — turn on'}
                  aria-pressed={autoReveal}
                  className={cn(
                    'flex items-center gap-1.5 px-4 font-semibold text-sm transition-colors border-l',
                    autoReveal
                      ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-700 text-white'
                      : 'bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 dark:hover:bg-gray-600 border-gray-400 dark:border-gray-800 text-gray-700 dark:text-gray-300',
                  )}
                >
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full',
                      autoReveal ? 'bg-white' : 'bg-gray-500 dark:bg-gray-500',
                    )}
                    aria-hidden
                  />
                  Auto
                </button>
              </div>
            </>
          )}

          {gameState.phase === 'voting' && gameState.revealed && (
            <>
              <Button variant="secondary" size="lg" onClick={newRound}>
                Re-vote
              </Button>
              <Button variant="success" size="lg" onClick={nextComponent} className="flex-1">
                {hasMoreComponents ? 'Next Component' : willSummarize ? 'Finish' : 'Next Ticket'}
              </Button>
            </>
          )}

          {gameState.phase === 'summary' && (
            <Button variant="primary" size="lg" onClick={newTicket} className="flex-1">
              New Ticket
            </Button>
          )}
        </div>
      )}

      {logEnabled() && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => {
              const text = ppLog.text();
              try {
                navigator.clipboard?.writeText(text);
              } catch {
                /* fall through — also dumped to console below */
              }
              console.log(text);
              setDebugCopied(true);
              setTimeout(() => setDebugCopied(false), 2000);
            }}
            className="text-xs text-gray-400 dark:text-gray-600 underline underline-offset-2 hover:text-gray-600 dark:hover:text-gray-400"
            title="Diagnostic logging is on. Copy the event log to share for debugging."
          >
            {debugCopied ? 'Debug log copied ✓' : 'Copy debug log'}
          </button>
        </div>
      )}
    </RoomScreen>
  );
}
