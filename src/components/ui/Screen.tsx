import { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { PAGE_BG } from './tokens';

// Full-height, centred layout for the entry screens. `topRight` pins an action
// cluster (the theme toggle) to the top-right corner.
export function CenteredScreen({
  topRight,
  children,
}: {
  topRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn('min-h-screen flex items-center justify-center p-4', PAGE_BG)}>
      {topRight && <div className="absolute top-4 right-4">{topRight}</div>}
      {children}
    </div>
  );
}

// Full-height room layout with a centred max-width column. `fill` makes the
// column grow so a footer can be pinned to the bottom with `mt-auto`.
export function RoomScreen({ fill = false, children }: { fill?: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'min-h-screen text-gray-900 dark:text-white p-4 md:p-8',
        PAGE_BG,
        fill && 'flex flex-col',
      )}
    >
      <div className={cn('max-w-2xl w-full mx-auto', fill && 'flex-1 flex flex-col')}>
        {children}
      </div>
    </div>
  );
}

// Centred container for the connection / loading / error fallbacks.
export function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div className={cn('min-h-screen flex items-center justify-center', PAGE_BG)}>
      <div className="text-center">{children}</div>
    </div>
  );
}
