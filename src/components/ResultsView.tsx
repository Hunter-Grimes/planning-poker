import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { GameState } from '../types';

interface Props {
  gameState: GameState;
}

export function ResultsView({ gameState }: Props) {
  const votes = gameState.players
    .filter((p) => p.vote !== null && p.vote !== '?' && p.connected)
    .map((p) => Number(p.vote));

  const allVotes = gameState.players
    .filter((p) => p.vote !== null && p.connected)
    .map((p) => p.vote!);

  if (allVotes.length === 0) return null;

  const avg = votes.length > 0 ? votes.reduce((a, b) => a + b, 0) / votes.length : null;

  // Find the most common vote
  const freq = allVotes.reduce<Record<string, number>>((acc, v) => {
    const k = String(v);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const maxFreq = Math.max(...Object.values(freq));
  const consensus = maxFreq === allVotes.length;

  useEffect(() => {
    if (!consensus) return;
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 },
    });
  }, [consensus]);

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
