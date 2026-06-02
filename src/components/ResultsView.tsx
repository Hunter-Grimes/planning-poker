import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { GameState } from '../types';
import { computeAverage, detectConsensus } from '../gameLogic';
import { Panel, Pill, SectionHeading } from './ui';

interface Props {
  gameState: GameState;
}

export function ResultsView({ gameState }: Props) {
  const hasAnyVote = gameState.players.some((p) => p.vote !== null && p.connected);
  const avg = computeAverage(gameState.players);
  const consensus = detectConsensus(gameState.players);

  // Fire confetti once per reveal of a given (round, component) — otherwise
  // re-renders after a late vote arrives can re-trigger it. Hooks must run
  // unconditionally, so the early "nothing to show" return lives below them.
  const revealKey = `${gameState.round}|${gameState.activeComponentId ?? ''}`;
  const firedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hasAnyVote || !consensus) return;
    if (firedKeyRef.current === revealKey) return;
    firedKeyRef.current = revealKey;
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 },
    });
  }, [hasAnyVote, consensus, revealKey]);

  if (!hasAnyVote) return null;

  return (
    <Panel>
      <SectionHeading as="h3">Results</SectionHeading>
      <div className="flex flex-wrap gap-2 mb-3">
        {gameState.players
          .filter((p) => p.connected && p.vote !== null)
          .map((p) => (
            <Pill key={p.id}>
              {p.name}: <strong>{String(p.vote)}</strong>
            </Pill>
          ))}
      </div>

      {avg !== null && (
        <p className="text-gray-700 dark:text-gray-300 text-sm">
          Average: <strong className="text-gray-900 dark:text-white">{avg.toFixed(1)}</strong>
        </p>
      )}
    </Panel>
  );
}
