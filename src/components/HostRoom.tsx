import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { usePeerHost } from '../hooks/usePeerHost';
import { CardDeck } from './CardDeck';
import { PlayerList } from './PlayerList';
import { ResultsView } from './ResultsView';
import { CardValue, GamePhase, Story } from '../types';
import { storage } from '../storage';

interface Props {
  hostName: string;
  roomCode?: string;
  onClose: () => void;
}

function SprintBacklog({
  stories,
  activeStoryId,
  phase,
  onAdd,
  onRemove,
  onToggle,
}: {
  stories: Story[];
  activeStoryId: string | null;
  phase: GamePhase;
  onAdd: (label: string) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setDraft('');
    inputRef.current?.focus();
  };

  const canManage = phase !== 'summary';

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
        Components
      </h2>

      {stories.length === 0 && (
        <p className="text-gray-600 text-sm mb-3">No components yet. Add one below.</p>
      )}

      {stories.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-3">
          {stories.map((story) => {
            const isActive = story.id === activeStoryId;
            const isDone = story.average !== null;
            const canDelete = canManage && !isActive;
            const canToggle = canManage && !isActive && !isDone;

            return (
              <div
                key={story.id}
                className={[
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm',
                  isActive
                    ? 'bg-indigo-950 border-indigo-700'
                    : isDone
                      ? 'bg-gray-900 border-gray-800'
                      : !story.enabled
                        ? 'bg-gray-900 border-gray-800 opacity-40'
                        : 'bg-gray-900 border-gray-700',
                ].join(' ')}
              >
                {canToggle ? (
                  <button
                    onClick={() => onToggle(story.id)}
                    title={story.enabled ? 'Exclude from voting' : 'Include in voting'}
                    className={[
                      'flex-none w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0',
                      story.enabled
                        ? 'bg-indigo-600 border-indigo-500'
                        : 'bg-transparent border-gray-600 hover:border-gray-400',
                    ].join(' ')}
                  >
                    {story.enabled && (
                      <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                ) : (
                  <span className="flex-none w-5" />
                )}

                <span
                  className={[
                    'flex-1 truncate',
                    isActive
                      ? 'text-white font-medium'
                      : isDone
                        ? 'text-gray-400'
                        : !story.enabled
                          ? 'text-gray-600'
                          : 'text-gray-300',
                  ].join(' ')}
                >
                  {story.label}
                </span>

                {isDone && (
                  <span className="flex-none text-xs text-gray-400 font-mono tabular-nums">
                    {story.average !== null ? story.average.toFixed(1) : '—'}
                  </span>
                )}
                {isActive && (
                  <span className="flex-none text-xs text-indigo-400 font-medium">Active</span>
                )}

                {canDelete && (
                  <button
                    onClick={() => onRemove(story.id)}
                    title="Remove component"
                    className="flex-none text-gray-600 hover:text-red-400 transition-colors text-lg leading-none"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canManage && (
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Add a component…"
            maxLength={120}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500"
          />
          <button
            onClick={handleAdd}
            disabled={!draft.trim()}
            className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white text-sm px-3 py-2 rounded-lg transition-colors"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

function SprintSummary({ stories }: { stories: Story[] }) {
  const voted = stories.filter((s) => s.enabled && s.average !== null);
  const total = voted.reduce((sum, s) => sum + s.average!, 0);

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
        Estimate Summary
      </h2>
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {voted.map((story) => (
          <div
            key={story.id}
            className="flex items-center justify-between px-4 py-3 border-b border-gray-800 last:border-0"
          >
            <span className="text-sm text-gray-300 truncate mr-4">{story.label}</span>
            <span className="text-sm font-mono text-white flex-none">
              {story.average!.toFixed(1)}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800">
          <span className="text-sm font-semibold text-white">Total</span>
          <span className="text-sm font-mono font-bold text-white">{total.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}

export function HostRoom({ hostName, roomCode, onClose }: Props) {
  const approvedPlayers = useMemo(() => storage.getHost()?.approvedPlayers ?? {}, []);
  const initialStories = useMemo(() => storage.getStories(), []);

  const {
    roomId,
    gameState,
    pendingPlayers,
    reveal,
    newRound,
    approvePlayer,
    denyPlayer,
    kickPlayer,
    castHostVote,
    error,
    addStory,
    removeStory,
    toggleStory,
    startVoting,
    nextStory,
    newSprint,
  } = usePeerHost(hostName, {
    roomCode,
    approvedPlayers,
    initialStories,
    onApprove: (persistentId, name) => storage.addApprovedPlayer(persistentId, name),
    onKick: (persistentId) => storage.removeApprovedPlayer(persistentId),
  });

  useEffect(() => {
    storage.saveStories(gameState.stories);
  }, [gameState.stories]);

  const [copied, setCopied] = useState(false);
  const [autoReveal, setAutoReveal] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (roomId) {
      const existing = storage.getHost();
      if (!existing || existing.roomCode !== roomId) {
        storage.saveHost({ hostName, roomCode: roomId, approvedPlayers: existing?.approvedPlayers ?? {} });
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

  const handleClose = () => {
    storage.clearHost();
    onClose();
  };

  const copyCode = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId).then(() => {
      setCopied(true);
      if (copyTimeoutRef.current !== null) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        copyTimeoutRef.current = null;
      }, 2000);
    });
  };

  const connectedCount = gameState.players.filter((p) => p.connected).length;
  const votedCount = gameState.players.filter((p) => p.connected && p.vote !== null).length;
  const allVoted = connectedCount > 0 && votedCount === connectedCount;

  useEffect(() => {
    if (autoReveal && allVoted && !gameState.revealed && gameState.phase === 'voting') reveal();
  }, [autoReveal, allVoted, gameState.revealed, gameState.phase, reveal]);

  const myVote = roomId ? (gameState.players.find((p) => p.id === roomId)?.vote ?? null) : null;

  // Is the active story the last enabled unvoted one?
  const currentStoryIdx = gameState.stories.findIndex((s) => s.id === gameState.activeStoryId);
  const hasMoreStories = gameState.stories.some(
    (s, i) => i > currentStoryIdx && s.enabled && s.average === null,
  );

  const activeStory = gameState.stories.find((s) => s.id === gameState.activeStoryId);
  const enabledCount = gameState.stories.filter((s) => s.enabled).length;

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">Connection error: {error}</p>
          <button
            onClick={handleClose}
            className="text-sm bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Back to Home
          </button>
        </div>
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
            <p className="text-gray-400 text-sm">
              {gameState.phase === 'summary'
                ? 'Estimate complete'
                : gameState.phase === 'voting'
                  ? `Round ${gameState.round} · You're the host`
                  : "You're the host"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-gray-800 text-gray-400 px-3 py-1 rounded-full border border-gray-700">
              {connectedCount} player{connectedCount !== 1 ? 's' : ''}
            </span>
            <button
              onClick={handleClose}
              className="text-xs bg-gray-800 hover:bg-red-900 text-gray-400 hover:text-red-300 px-3 py-1 rounded-full border border-gray-700 hover:border-red-800 transition-colors"
              title="Close session"
            >
              Close session
            </button>
          </div>
        </div>

        {/* Room code */}
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

        {/* Currently voting banner */}
        {gameState.phase === 'voting' && activeStory && (
          <div className="bg-indigo-950 border border-indigo-800 rounded-xl px-4 py-3 mb-6">
            <p className="text-xs text-indigo-400 font-medium uppercase tracking-wide mb-0.5">
              Currently voting
            </p>
            <p className="text-white font-semibold">{activeStory.label}</p>
          </div>
        )}

        {/* Pending approvals */}
        {pendingPlayers.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-yellow-400 uppercase tracking-wide mb-3">
              Waiting to join ({pendingPlayers.length})
            </h2>
            <div className="flex flex-col gap-2">
              {pendingPlayers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-4 py-3 rounded-xl border bg-gray-900 border-yellow-700"
                >
                  <span className="text-sm font-medium text-gray-200">{p.name}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => approvePlayer(p.id)}
                      className="text-xs bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1 rounded-lg transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => denyPlayer(p.id)}
                      className="text-xs bg-red-800 hover:bg-red-700 text-white px-3 py-1 rounded-lg transition-colors"
                    >
                      Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Players */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            {gameState.phase === 'voting'
              ? `Players (${votedCount}/${connectedCount} voted)`
              : `Players (${connectedCount})`}
          </h2>
          <PlayerList gameState={gameState} myId={roomId} onKick={kickPlayer} />
        </div>

        {/* Sprint summary */}
        {gameState.phase === 'summary' && <SprintSummary stories={gameState.stories} />}

        {/* Results */}
        {gameState.phase === 'voting' && gameState.revealed && (
          <div className="mb-6">
            <ResultsView gameState={gameState} />
          </div>
        )}

        {/* Your cards */}
        {gameState.phase === 'voting' && !gameState.revealed && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Your vote
            </h2>
            <CardDeck selected={myVote} onSelect={handleVote} disabled={gameState.revealed} />
          </div>
        )}

        {/* Sprint backlog */}
        {gameState.phase !== 'summary' && (
          <div className="mb-6">
            <SprintBacklog
              stories={gameState.stories}
              activeStoryId={gameState.activeStoryId}
              phase={gameState.phase}
              onAdd={addStory}
              onRemove={removeStory}
              onToggle={toggleStory}
            />
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-3">
          {gameState.phase === 'setup' && (
            <button
              onClick={startVoting}
              disabled={enabledCount === 0}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-xl py-3 transition-colors"
            >
              {enabledCount === 0 ? 'Add components to start' : 'Start Voting'}
            </button>
          )}

          {gameState.phase === 'voting' && !gameState.revealed && (
            <>
              <button
                onClick={handleReveal}
                disabled={votedCount === 0}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-xl py-3 transition-colors"
              >
                {allVoted ? 'Reveal Votes' : `Reveal Votes (${votedCount}/${connectedCount})`}
              </button>
              <button
                onClick={() => setAutoReveal((v) => !v)}
                title="Auto-reveal when all players have voted"
                className={[
                  'px-4 rounded-xl border font-semibold text-sm transition-colors',
                  autoReveal
                    ? 'bg-indigo-900 border-indigo-600 text-indigo-300'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500',
                ].join(' ')}
              >
                Auto
              </button>
            </>
          )}

          {gameState.phase === 'voting' && gameState.revealed && (
            <>
              <button
                onClick={handleNewRound}
                className="bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-xl py-3 px-5 transition-colors"
              >
                Re-vote
              </button>
              <button
                onClick={nextStory}
                className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold rounded-xl py-3 transition-colors"
              >
                {hasMoreStories ? 'Next Component' : 'Finish'}
              </button>
            </>
          )}

          {gameState.phase === 'summary' && (
            <button
              onClick={newSprint}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl py-3 transition-colors"
            >
              New Ticket
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
