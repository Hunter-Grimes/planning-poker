import { CardValue, FIBONACCI_CARDS } from '../types';
import { CARD_COLORS } from '../cardColors';

interface Props {
  selected: CardValue | null;
  onSelect: (value: CardValue) => void;
  disabled?: boolean;
}

export function CardDeck({ selected, onSelect, disabled = false }: Props) {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {FIBONACCI_CARDS.map((card, i) => {
        const isSelected = selected === card;
        const colors = CARD_COLORS[i];
        return (
          <button
            key={String(card)}
            onClick={() => !disabled && onSelect(card)}
            disabled={disabled}
            className={[
              'w-16 h-24 rounded-xl text-xl font-bold border-2 transition-all duration-150 select-none',
              disabled ? 'cursor-default' : `cursor-pointer hover:scale-105 active:scale-95 ${colors.hover}`,
              isSelected
                ? `${colors.selected} scale-110`
                : disabled
                  ? 'bg-gray-800 border-gray-700 text-gray-500'
                  : colors.idle,
            ].join(' ')}
          >
            {String(card)}
          </button>
        );
      })}
    </div>
  );
}
