import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { usePeerHost } from '../../hooks/usePeerHost';
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
import { CardValue } from '../../domain/types';
import { nextComponentAfterActive } from '../../domain/gameLogic';
import { cn } from '../../lib/cn';
import { storage } from '../../lib/storage';

interface Props {
  hostName: string;
  roomCode?: string;
  onClose: () => void;
}

export function HostRoom({ hostName, roomCode, onClose }: Props) {
  const approvedPlayers = useMemo(() => storage.getHost()?.approvedPlayers ?? {}, []);
  const initialComponents = useMemo(() => storage.getComponents(), []);

  const {
    roomId,
    gameState,
    pendingPlayers,
    reveal,
    newRound,
    restartRound,
    approvePlayer,
    denyPlayer,
    kickPlayer,
    castHostVote,
    castHostActive,
    error,
    addComponent,
    removeComponent,
    toggleComponent,
    renameComponent,
    nextComponent,
    newTicket,
  } = usePeerHost(hostName, {
    roomCode,
    approvedPlayers,
    initialComponents,
    onApprove: (persistentId, name) => storage.addApprovedPlayer(persistentId, name),
    onKick: (persistentId) => storage.removeApprovedPlayer(persistentId),
  });

  useEffect(() => {
    storage.saveComponents(gameState.components);
  }, [gameState.components]);

  const [copied, setCopied] = useState(false);
  const [autoReveal, setAutoReveal] = useState(false);
  // Held here, not in ComponentList, so the open/closed choice survives the
  // backlog unmounting during the summary phase (e.g. across New Ticket).
  const [backlogOpen, setBacklogOpen] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (roomId) {
      const existing = storage.getHost();
      if (!existing || existing.roomCode !== roomId) {
        storage.saveHost({
          hostName,
          roomCode: roomId,
          approvedPlayers: existing?.approvedPlayers ?? {},
        });
      }
    }
  }, [roomId, hostName]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleVote = useCallback(
    (value: CardValue) => {
      if (gameState.revealed) return;
      castHostVote(value);
    },
    [gameState.revealed, castHostVote],
  );

  const handleReveal = useCallback(() => reveal(), [reveal]);
  const handleNewRound = useCallback(() => newRound(), [newRound]);
  const handleRestart = useCallback(() => restartRound(), [restartRound]);

  const handleClose = () => {
    storage.clearHost();
    storage.clearComponents();
    onClose();
  };

  const copyCode = async () => {
    if (!roomId) return;
    const showCopied = () => {
      setCopied(true);
      if (copyTimeoutRef.current !== null) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        copyTimeoutRef.current = null;
      }, 2000);
    };
    // Modern path
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(roomId);
        showCopied();
        return;
      } catch {
        // fall through to legacy
      }
    }
    // Legacy / insecure-context fallback so users still get feedback.
    try {
      const ta = document.createElement('textarea');
      ta.value = roomId;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showCopied();
    } catch {
      // Last resort: still flip the indicator so the click isn't silent.
      showCopied();
    }
  };

  const connectedCount = gameState.players.filter((p) => p.connected).length;
  const votedCount = gameState.players.filter((p) => p.connected && p.vote !== null).length;
  const allVoted = connectedCount > 0 && votedCount === connectedCount;

  useEffect(() => {
    if (autoReveal && allVoted && !gameState.revealed && gameState.phase === 'voting') reveal();
  }, [autoReveal, allVoted, gameState.revealed, gameState.phase, reveal]);

  const myVote = roomId ? (gameState.players.find((p) => p.id === roomId)?.vote ?? null) : null;

  // Is there another component to vote on after this one? Shares the reducer's
  // forward-search helper so the label and the advance action stay in lockstep.
  const hasMoreComponents = nextComponentAfterActive(gameState) !== null;

  // Finishing leads to the summary only if something was (or is about to be)
  // estimated. With no components there's nothing to summarize, so the advance
  // button moves straight to the next ticket instead.
  const willSummarize =
    gameState.activeComponentId !== null ||
    gameState.components.some((s) => s.enabled && s.average !== null);

  const activeComponent = gameState.components.find((s) => s.id === gameState.activeComponentId);

  if (error) {
    return (
      <CenteredMessage>
        <p className="text-red-600 dark:text-red-400 mb-4">Connection error: {error}</p>
        <Button variant="secondary" onClick={handleClose}>
          Back to Home
        </Button>
      </CenteredMessage>
    );
  }

  if (!roomId) {
    return (
      <CenteredMessage>
        <p className="text-gray-500 dark:text-gray-400 animate-pulse">Creating room…</p>
      </CenteredMessage>
    );
  }

  return (
    <RoomScreen fill>
      <RoomHeader phase={gameState.phase} round={gameState.round}>
        <PillButton
          variant={copied ? 'success' : 'neutral'}
          onClick={copyCode}
          title="Copy room code"
          aria-label={copied ? 'Room code copied' : 'Copy room code'}
          aria-live="polite"
        >
          {copied ? (
            <>
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 8l3.5 3.5L13 5" />
              </svg>
              <span className="font-semibold tracking-wide">Code copied</span>
            </>
          ) : (
            <>
              <span className="font-mono font-semibold tracking-[0.15em] text-gray-900 dark:text-white">
                {roomId}
              </span>
              <svg
                className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="5" y="5" width="8" height="8" rx="1.5" />
                <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H4.5A1.5 1.5 0 0 0 3 3.5v6A1.5 1.5 0 0 0 4.5 11H5" />
              </svg>
            </>
          )}
        </PillButton>
        <ThemeToggle />
        <PillButton variant="dangerHover" onClick={handleClose} title="Close Room">
          Close Room
        </PillButton>
      </RoomHeader>

      {gameState.phase === 'voting' && activeComponent && (
        <VotingBanner label={activeComponent.label} />
      )}

      {/* Pending approvals */}
      {pendingPlayers.length > 0 && (
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
          myId={roomId}
          hostId={gameState.hostId}
          onKick={kickPlayer}
        />
      </div>

      {/* Ticket summary */}
      {gameState.phase === 'summary' && <TicketSummary components={gameState.components} />}

      {/* Results */}
      {gameState.phase === 'voting' && gameState.revealed && (
        <div className="mb-6">
          <ResultsView gameState={gameState} />
        </div>
      )}

      {/* Your cards */}
      {gameState.phase === 'voting' && !gameState.revealed && (
        <div className="mb-6">
          <SectionHeading>Your vote</SectionHeading>
          <CardDeck
            selected={myVote}
            onSelect={handleVote}
            onActivate={castHostActive}
            stageKey={`${gameState.round}-${gameState.activeComponentId ?? 'none'}`}
          />
        </div>
      )}

      {/* Component list */}
      {gameState.phase !== 'summary' && (
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

      {/* Controls */}
      <div className="flex gap-3 mt-auto pt-6">
        {gameState.phase === 'voting' && !gameState.revealed && (
          <>
            <Button
              variant="secondary"
              size="lg"
              onClick={handleRestart}
              disabled={votedCount === 0}
              title="Reset all votes and restart this round"
            >
              Restart
            </Button>
            <div className="flex flex-1 rounded-xl overflow-hidden">
              {/* Segmented control: the reveal action and its auto-reveal toggle
                    share one rounded shell, so these buttons stay un-rounded. */}
              <button
                type="button"
                onClick={handleReveal}
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
            <Button variant="secondary" size="lg" onClick={handleNewRound}>
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
    </RoomScreen>
  );
}
