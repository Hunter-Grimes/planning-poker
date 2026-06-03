import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { CARD_SURFACE, PANEL_SURFACE } from './tokens';

// Raised surface (white card). Radius/padding/layout come from className.
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(CARD_SURFACE, 'rounded-xl', className)} {...props} />;
}

// Inset surface for sub-sections nested inside a page or card.
export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(PANEL_SURFACE, 'rounded-xl p-4', className)} {...props} />;
}

// Centred modal card used by the entry screens.
export function ModalCard({ children }: { children: ReactNode }) {
  return (
    <div className={cn(CARD_SURFACE, 'rounded-2xl p-8 w-full max-w-sm shadow-2xl')}>{children}</div>
  );
}
