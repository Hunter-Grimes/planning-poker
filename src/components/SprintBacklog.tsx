import { useState, useRef } from 'react';
import { GamePhase, MAX_STORY_LABEL_LENGTH, Story } from '../types';
import { cn } from '../cn';

interface Props {
  stories: Story[];
  activeStoryId: string | null;
  phase: GamePhase;
  revealed: boolean;
  onAdd: (label: string) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
  onRename: (id: string, label: string) => void;
}

// Collapsible component/story list for the host: add, rename, include/exclude,
// and remove stories, with the active and already-estimated ones called out.
export function SprintBacklog({
  stories,
  activeStoryId,
  phase,
  revealed,
  onAdd,
  onRemove,
  onToggle,
  onRename,
}: Props) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [open, setOpen] = useState(false);

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
            className={cn('w-3 h-3 transition-transform', open && 'rotate-90')}
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

      {open && (
        <div id="components-panel">
          {stories.length === 0 && (
            <p className="text-gray-500 dark:text-gray-600 text-sm mb-3">
              No components yet. Add one below.
            </p>
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
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm',
                      isActive
                        ? 'bg-indigo-50 dark:bg-indigo-950 border-indigo-300 dark:border-indigo-700'
                        : isDone
                          ? 'bg-gray-100 dark:bg-gray-900 border-gray-200 dark:border-gray-800'
                          : !story.enabled
                            ? 'bg-gray-100 dark:bg-gray-900 border-gray-200 dark:border-gray-800 opacity-40'
                            : 'bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-700',
                    )}
                  >
                    {canToggle ? (
                      <button
                        onClick={() => onToggle(story.id)}
                        title={story.enabled ? 'Exclude from voting' : 'Include in voting'}
                        className={cn(
                          'flex-none w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0',
                          story.enabled
                            ? 'bg-indigo-600 border-indigo-500'
                            : 'bg-transparent border-gray-400 dark:border-gray-600 hover:border-gray-600 dark:hover:border-gray-400',
                        )}
                      >
                        {story.enabled && (
                          <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                            <path
                              d="M2 6l3 3 5-5"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
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
                        maxLength={MAX_STORY_LABEL_LENGTH}
                        className="flex-1 min-w-0 bg-transparent border-b border-indigo-400 dark:border-indigo-500 text-gray-900 dark:text-white outline-none px-0.5"
                      />
                    ) : (
                      <span
                        className={cn(
                          'flex-1 truncate',
                          isActive
                            ? 'text-gray-900 dark:text-white font-medium'
                            : isDone
                              ? 'text-gray-500 dark:text-gray-400'
                              : !story.enabled
                                ? 'text-gray-400 dark:text-gray-600'
                                : 'text-gray-700 dark:text-gray-300',
                        )}
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
                          <svg
                            className="w-4 h-4"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M11.5 2.5l2 2L5 13l-3 1 1-3 8.5-8.5z" />
                          </svg>
                        </button>
                        <span className="flex-none text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                          Active
                        </span>
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
                maxLength={MAX_STORY_LABEL_LENGTH}
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
