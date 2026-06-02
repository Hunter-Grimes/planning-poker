import { useRef } from 'react';
import { CardValue, FIBONACCI_CARDS } from '../types';
import { CARD_COLORS } from '../cardColors';
import { cn } from '../cn';

interface Props {
  selected: CardValue | null;
  onSelect: (value: CardValue) => void;
  onActivate?: () => void;
  stageKey?: string;
  disabled?: boolean;
}

export function CardDeck({ selected, onSelect, onActivate, stageKey, disabled = false }: Props) {
  // Fire onActivate at most once per voting stage — and only when the mouse
  // actually enters a card. If the cursor was already parked on a card from
  // the previous round, no new mouseenter fires, so we don't signal.
  const lastFiredKeyRef = useRef<string | null>(null);
  const handleMouseEnter = () => {
    if (disabled || !onActivate || stageKey == null) return;
    if (lastFiredKeyRef.current === stageKey) return;
    lastFiredKeyRef.current = stageKey;
    onActivate();
  };

  return (
    <div className="flex flex-wrap justify-center gap-3 max-w-[480px] mx-auto md:max-w-none">
      {FIBONACCI_CARDS.map((card, i) => {
        const isSelected = selected === card;
        const colors = CARD_COLORS[i];
        return (
          <button
            key={String(card)}
            onClick={() => !disabled && onSelect(card)}
            onMouseEnter={handleMouseEnter}
            disabled={disabled}
            className={cn(
              'w-16 h-24 rounded-xl text-xl font-bold border-2 transition-all duration-150 select-none overflow-hidden',
              disabled
                ? 'cursor-default'
                : isSelected
                  ? 'cursor-pointer active:scale-95'
                  : `cursor-pointer hover:scale-105 active:scale-95 ${colors.hover}`,
              isSelected
                ? `${colors.selected} scale-110`
                : disabled
                  ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-400 dark:text-gray-500'
                  : colors.idle,
            )}
          >
            {String(card)}
          </button>
        );
      })}
    </div>
  );
}
