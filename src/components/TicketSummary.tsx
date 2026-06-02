import { Component } from '../types';
import { Card, SectionHeading } from './ui';

interface Props {
  components: Component[];
}

// Read-only estimate summary for the summary phase: one row per voted component
// plus a total. Identical for host and guests.
// The host only ever enters the summary phase once at least one component has
// been estimated (see nextComponent), so `voted` is guaranteed non-empty here.
export function TicketSummary({ components }: Props) {
  const voted = components.filter((s) => s.enabled && s.average !== null);
  const total = voted.reduce((sum, s) => sum + s.average!, 0);

  return (
    <div className="mb-6">
      <SectionHeading>Estimate Summary</SectionHeading>
      <Card className="overflow-hidden">
        {voted.map((component) => (
          <div
            key={component.id}
            className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 last:border-0"
          >
            <span className="text-sm text-gray-700 dark:text-gray-300 truncate mr-4">
              {component.label}
            </span>
            <span className="text-sm font-mono text-gray-900 dark:text-white flex-none">
              {component.average!.toFixed(1)}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-100 dark:bg-gray-800">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Total</span>
          <span className="text-sm font-mono font-bold text-gray-900 dark:text-white">
            {total.toFixed(1)}
          </span>
        </div>
      </Card>
    </div>
  );
}
