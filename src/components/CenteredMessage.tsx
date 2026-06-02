import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

// Full-screen, vertically-centered container for the connection / loading /
// error states a room falls back to before (or instead of) rendering the board.
export function CenteredMessage({ children }: Props) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
      <div className="text-center">{children}</div>
    </div>
  );
}
