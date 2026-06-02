import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { GameState } from '../types';
import { computeAverage, detectConsensus } from '../gameLogic';

interface Props {
  gameState: GameState;
}

export function ResultsView({ gameState }: Props) {
  const hasAnyVote = gameState.players.some((p) => p.vote !== null && p.connected);
  if (!hasAnyVote) return null;

  const avg = computeAverage(gameState.players);
  const consensus = detectConsensus(gameState.players);

  // Fire confetti once per reveal of a given (round, story) — otherwise
  // re-renders after a late vote arrives can re-trigger it.
  const revealKey = `${gameState.round}|${gameState.activeStoryId ?? ''}`;
  const firedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!consensus) return;
    if (firedKeyRef.current === revealKey) return;
    firedKeyRef.current = revealKey;
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 },
    });
  }, [consensus, revealKey]);

  return (
    <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Results</h3>
      <div className="flex flex-wrap gap-2 mb-3">
        {gameState.players
          .filter((p) => p.connected && p.vote !== null)
          .map((p) => (
            <span
              key={p.id}
              className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white text-sm px-3 py-1 rounded-full"
            >
              {p.name}: <strong>{String(p.vote)}</strong>
            </span>
          ))}
      </div>

      {avg !== null && (
        <p className="text-gray-700 dark:text-gray-300 text-sm">
          Average: <strong className="text-gray-900 dark:text-white">{avg.toFixed(1)}</strong>
        </p>
      )}
    </div>
  );
}
