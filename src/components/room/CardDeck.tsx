import { useEffect, useRef } from 'react';
import { CardValue, FIBONACCI_CARDS } from '../../domain/types';
import { CARD_COLORS } from '../../domain/cardColors';
import { cn } from '../../lib/cn';

// How long a hover must "settle" before we signal active. On touch a single tap
// synthesizes a mouseenter a few ms before the click, so we wait this long to
// see whether a vote lands first — if it does, the active signal is cancelled
// (a vote already implies the player is active). Short enough to be
// imperceptible on a real desktop hover.
const ACTIVATE_DELAY_MS = 150;

interface Props {
  selected: CardValue | null;
  onSelect: (value: CardValue) => void;
  onActivate?: () => void;
  stageKey?: string;
}

export function CardDeck({ selected, onSelect, onActivate, stageKey }: Props) {
  // Fire onActivate at most once per voting stage, and only when a hover
  // settles without a click landing behind it. The mouseenter schedules the
  // signal; a vote (or unmount) cancels it. This keeps the "active" indicator
  // for genuine desktop hovers while skipping the functionally useless signal
  // a touch tap would otherwise emit right before its vote.
  const lastFiredKeyRef = useRef<string | null>(null);
  const activateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingActivate = () => {
    if (activateTimerRef.current !== null) {
      clearTimeout(activateTimerRef.current);
      activateTimerRef.current = null;
    }
  };

  // Drop any pending signal if the deck unmounts mid-window.
  useEffect(() => cancelPendingActivate, []);

  const handleMouseEnter = () => {
    if (!onActivate || stageKey == null) return;
    if (lastFiredKeyRef.current === stageKey) return;
    if (activateTimerRef.current !== null) return; // already waiting to fire
    const key = stageKey;
    activateTimerRef.current = setTimeout(() => {
      activateTimerRef.current = null;
      lastFiredKeyRef.current = key;
      onActivate();
    }, ACTIVATE_DELAY_MS);
  };

  const handleSelect = (card: CardValue) => {
    // A vote implies "active" — cancel the pending hover signal so it can't
    // fire redundantly (and race the host's throttle) right behind the vote,
    // and mark this stage as handled so later hovers stay quiet.
    cancelPendingActivate();
    if (stageKey != null) lastFiredKeyRef.current = stageKey;
    onSelect(card);
  };

  return (
    <div className="flex flex-wrap justify-center gap-3 max-w-[480px] mx-auto md:max-w-none">
      {FIBONACCI_CARDS.map((card, i) => {
        const isSelected = selected === card;
        const colors = CARD_COLORS[i];
        return (
          <button
            key={String(card)}
            onClick={() => handleSelect(card)}
            onMouseEnter={handleMouseEnter}
            className={cn(
              'w-16 h-24 rounded-xl text-xl font-bold border-2 transition-all duration-150 select-none overflow-hidden',
              isSelected
                ? 'cursor-pointer active:scale-95'
                : `cursor-pointer hover:scale-105 active:scale-95 ${colors.hover}`,
              isSelected ? `${colors.selected} scale-110` : colors.idle,
            )}
          >
            {String(card)}
          </button>
        );
      })}
    </div>
  );
}
