import { ReactNode } from 'react';
import { GamePhase } from '../types';

interface Props {
  phase: GamePhase;
  round: number;
  // Right-aligned action cluster — differs per room (host: copy code / theme /
  // close; guest: theme / leave).
  children: ReactNode;
}

// Shared room header card: shows the current round (or "Estimate complete") on
// the left and a caller-supplied action cluster on the right.
export function RoomHeader({ phase, round, children }: Props) {
  return (
    <div className="mb-6 flex items-center justify-between gap-3 flex-wrap bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 min-w-0">
        {phase === 'voting' ? (
          <>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-indigo-600 dark:text-indigo-400">
              Round
            </span>
            <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white leading-none">
              {round}
            </span>
          </>
        ) : (
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Estimate complete
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap justify-end">{children}</div>
    </div>
  );
}
