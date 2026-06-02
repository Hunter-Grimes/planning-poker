import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { usePeerHost } from '../hooks/usePeerHost';
import { CardDeck } from './CardDeck';
import { PlayerList } from './PlayerList';
import { ResultsView } from './ResultsView';
import { ThemeToggle } from './ThemeToggle';
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
  revealed,
  onAdd,
  onRemove,
  onToggle,
  onRename,
}: {
  stories: Story[];
  activeStoryId: string | null;
  phase: GamePhase;
  revealed: boolean;
  onAdd: (label: string) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
  onRename: (id: string, label: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const startEdit = (id: string, label: string) => {
    setEditingId(id);
    setEditDraft(label);
  };
  const commitEdit = () => {
    if (editingId !== null) onRename(editingId, editDraft);
    setEditingId(null);
  };
  const cancelEdit = () => setEditingId(null);

  const handleAdd = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setDraft('');
    inputRef.current?.focus();
  };

  const canManage = phase !== 'summary';

  const [open, setOpen] = useState(false);
  const doneCount = stories.filter((s) => s.average !== null).length;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="components-panel"
        className="w-full flex items-center justify-between text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        <span className="flex items-center gap-2">
          <svg
            className={['w-3 h-3 transition-transform', open ? 'rotate-90' : ''].join(' ')}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 2l4 4-4 4" />
          </svg>
          Components
          <span className="normal-case tracking-normal text-xs text-gray-400 dark:text-gray-500 font-normal">
            ({doneCount}/{stories.length})
          </span>
        </span>
      </button>

      {!open ? null : (
        <div id="components-panel">
          {stories.length === 0 && (
            <p className="text-gray-500 dark:text-gray-600 text-sm mb-3">No components yet. Add one below.</p>
          )}

          {stories.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-3">
          {stories.map((story) => {
            const isActive = story.id === activeStoryId;
            const isDone = story.average !== null;
            // While votes are revealed, the active component is locked — removing
            // or disabling it mid-reveal is disallowed (rename is still fine).
            const lockedActive = isActive && revealed;
            const canDelete = canManage && !lockedActive;
            const canToggle = canManage && !isDone && !lockedActive;
            const isEditing = editingId === story.id;

            return (
              <div
                key={story.id}
                className={[
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm',
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-950 border-indigo-300 dark:border-indigo-700'
                    : isDone
                      ? 'bg-gray-100 dark:bg-gray-900 border-gray-200 dark:border-gray-800'
                      : !story.enabled
                        ? 'bg-gray-100 dark:bg-gray-900 border-gray-200 dark:border-gray-800 opacity-40'
                        : 'bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-700',
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
                        : 'bg-transparent border-gray-400 dark:border-gray-600 hover:border-gray-600 dark:hover:border-gray-400',
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

                {isEditing && isActive ? (
                  <input
                    autoFocus
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit();
                      else if (e.key === 'Escape') cancelEdit();
                    }}
                    onBlur={commitEdit}
                    maxLength={120}
                    className="flex-1 min-w-0 bg-transparent border-b border-indigo-400 dark:border-indigo-500 text-gray-900 dark:text-white outline-none px-0.5"
                  />
                ) : (
                  <span
                    className={[
                      'flex-1 truncate',
                      isActive
                        ? 'text-gray-900 dark:text-white font-medium'
                        : isDone
                          ? 'text-gray-500 dark:text-gray-400'
                          : !story.enabled
                            ? 'text-gray-400 dark:text-gray-600'
                            : 'text-gray-700 dark:text-gray-300',
                    ].join(' ')}
                  >
                    {story.label}
                  </span>
                )}

                {isDone && (
                  <span className="flex-none text-xs text-gray-500 dark:text-gray-400 font-mono tabular-nums">
                    {story.average !== null ? story.average.toFixed(1) : '—'}
                  </span>
                )}
                {isActive && !isEditing && (
                  <>
                    <button
                      onClick={() => startEdit(story.id, story.label)}
                      title="Rename"
                      aria-label="Rename component"
                      className="flex-none text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11.5 2.5l2 2L5 13l-3 1 1-3 8.5-8.5z" />
                      </svg>
                    </button>
                    <span className="flex-none text-xs text-indigo-600 dark:text-indigo-400 font-medium">Active</span>
                  </>
                )}

                {canDelete && (
                  <button
                    onClick={() => onRemove(story.id)}
                    title="Remove component"
                    className="flex-none text-gray-400 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors text-lg leading-none"
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
                className="flex-1 bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-gray-500"
              />
              <button
                onClick={handleAdd}
                disabled={!draft.trim()}
                className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600 text-gray-900 dark:text-white text-sm px-3 py-2 rounded-lg transition-colors"
              >
                Add
              </button>
            </div>
          )}
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
      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
        Estimate Summary
      </h2>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {voted.map((story) => (
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
          <span className="text-sm font-mono font-bold text-gray-900 dark:text-white">{total.toFixed(1)}</span>
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
    castHostActive,
    error,
    addStory,
    removeStory,
    toggleStory,
    renameStory,
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
    storage.clearStories();
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

  // Is the active story the last enabled unvoted one?
  const currentStoryIdx = gameState.stories.findIndex((s) => s.id === gameState.activeStoryId);
  const hasMoreStories = gameState.stories.some(
    (s, i) => i > currentStoryIdx && s.enabled && s.average === null,
  );

  const activeStory = gameState.stories.find((s) => s.id === gameState.activeStoryId);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">Connection error: {error}</p>
          <button
            onClick={handleClose}
            className="text-sm bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-4 py-2 rounded-lg transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (!roomId) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400 animate-pulse">Creating room…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white p-4 md:p-8 flex flex-col">
      <div className="max-w-2xl w-full mx-auto flex-1 flex flex-col">
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
            <button
              onClick={copyCode}
              title="Copy room code"
              aria-label={copied ? 'Room code copied' : 'Copy room code'}
              className={[
                'flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-colors',
                copied
                  ? 'bg-emerald-100 dark:bg-emerald-950 border-emerald-400 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                  : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700',
              ].join(' ')}
              aria-live="polite"
            >
              {copied ? (
                <>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 8l3.5 3.5L13 5" />
                  </svg>
                  <span className="font-semibold tracking-wide">Code copied</span>
                </>
              ) : (
                <>
                  <span className="font-mono font-semibold tracking-[0.15em] text-gray-900 dark:text-white">
                    {roomId}
                  </span>
                  <svg className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="5" y="5" width="8" height="8" rx="1.5" />
                    <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H4.5A1.5 1.5 0 0 0 3 3.5v6A1.5 1.5 0 0 0 4.5 11H5" />
                  </svg>
                </>
              )}
            </button>
            <ThemeToggle />
            <button
              onClick={handleClose}
              className="text-xs bg-gray-100 dark:bg-gray-800 hover:bg-red-100 dark:hover:bg-red-950 text-gray-500 dark:text-gray-400 hover:text-red-700 dark:hover:text-red-300 px-3 py-1 rounded-full border border-gray-300 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-800 transition-colors"
              title="Close Room"
            >
              Close Room
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

        {/* Pending approvals */}
        {pendingPlayers.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-yellow-700 dark:text-yellow-400 uppercase tracking-wide mb-3">
              Waiting to join ({pendingPlayers.length})
            </h2>
            <div className="flex flex-col gap-2">
              {pendingPlayers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-4 py-3 rounded-xl border bg-yellow-50 dark:bg-gray-900 border-yellow-300 dark:border-yellow-700"
                >
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{p.name}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => approvePlayer(p.id)}
                      className="text-xs bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1 rounded-lg transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => denyPlayer(p.id)}
                      className="text-xs bg-red-700 dark:bg-red-800 hover:bg-red-600 dark:hover:bg-red-700 text-white px-3 py-1 rounded-lg transition-colors"
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
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            {gameState.phase === 'voting'
              ? `${votedCount}/${connectedCount} voted`
              : `Players (${connectedCount})`}
          </h2>
          <PlayerList gameState={gameState} myId={roomId} hostId={gameState.hostId} onKick={kickPlayer} />
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
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Your vote
            </h2>
            <CardDeck
              selected={myVote}
              onSelect={handleVote}
              onActivate={castHostActive}
              stageKey={`${gameState.round}-${gameState.activeStoryId ?? 'none'}`}
              disabled={gameState.revealed}
            />
          </div>
        )}

        {/* Sprint backlog */}
        {gameState.phase !== 'summary' && (
          <div className="mb-6">
            <SprintBacklog
              stories={gameState.stories}
              activeStoryId={gameState.activeStoryId}
              phase={gameState.phase}
              revealed={gameState.revealed}
              onAdd={addStory}
              onRemove={removeStory}
              onToggle={toggleStory}
              onRename={renameStory}
            />
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-3 mt-auto pt-6">
          {gameState.phase === 'voting' && !gameState.revealed && (
            <>
              <button
                onClick={handleNewRound}
                disabled={votedCount === 0}
                title="Reset all votes and restart this round"
                className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600 text-gray-900 dark:text-white font-semibold rounded-xl py-3 px-5 transition-colors"
              >
                Restart
              </button>
              <div className="flex flex-1 rounded-xl overflow-hidden">
                <button
                  onClick={handleReveal}
                  disabled={votedCount === 0}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-3 transition-colors"
                >
                  {allVoted ? 'Reveal Votes' : `Reveal Votes (${votedCount}/${connectedCount})`}
                </button>
                <button
                  onClick={() => setAutoReveal((v) => !v)}
                  title={autoReveal ? 'Auto-reveal is on — turn off' : 'Auto-reveal is off — turn on'}
                  aria-pressed={autoReveal}
                  className={[
                    'flex items-center gap-1.5 px-4 font-semibold text-sm transition-colors border-l',
                    autoReveal
                      ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-700 text-white'
                      : 'bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 dark:hover:bg-gray-600 border-gray-400 dark:border-gray-800 text-gray-700 dark:text-gray-300',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'w-2 h-2 rounded-full',
                      autoReveal ? 'bg-white' : 'bg-gray-500 dark:bg-gray-500',
                    ].join(' ')}
                    aria-hidden
                  />
                  Auto
                </button>
              </div>
            </>
          )}

          {gameState.phase === 'voting' && gameState.revealed && (
            <>
              <button
                onClick={handleNewRound}
                className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-xl py-3 px-5 transition-colors"
              >
                Re-vote
              </button>
              {(gameState.activeStoryId !== null ||
                gameState.stories.some((s) => s.average !== null)) && (
                <button
                  onClick={nextStory}
                  className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold rounded-xl py-3 transition-colors"
                >
                  {hasMoreStories ? 'Next Component' : 'Finish'}
                </button>
              )}
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
