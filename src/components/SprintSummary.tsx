import { Story } from '../types';

interface Props {
  stories: Story[];
}

// Read-only estimate summary for the summary phase: one row per voted story
// plus a total. Identical for host and guests.
export function SprintSummary({ stories }: Props) {
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
            <span className="text-sm text-gray-700 dark:text-gray-300 truncate mr-4">
              {story.label}
            </span>
            <span className="text-sm font-mono text-gray-900 dark:text-white flex-none">
              {story.average!.toFixed(1)}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-100 dark:bg-gray-800">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Total</span>
          <span className="text-sm font-mono font-bold text-gray-900 dark:text-white">
            {total.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  );
}
