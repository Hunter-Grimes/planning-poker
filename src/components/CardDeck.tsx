import { CardValue, FIBONACCI_CARDS } from '../types';

interface Props {
  selected: CardValue | null;
  onSelect: (value: CardValue) => void;
  disabled?: boolean;
}

export function CardDeck({ selected, onSelect, disabled = false }: Props) {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {FIBONACCI_CARDS.map((card) => {
        const isSelected = selected === card;
        return (
          <button
            key={String(card)}
            onClick={() => !disabled && onSelect(card)}
            disabled={disabled}
            className={[
              'w-16 h-24 rounded-xl text-xl font-bold border-2 transition-all duration-150 select-none',
              disabled ? 'cursor-default' : 'cursor-pointer hover:scale-105 active:scale-95',
              isSelected
                ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-900 scale-110'
                : disabled
                  ? 'bg-gray-800 border-gray-700 text-gray-500'
                  : 'bg-gray-800 border-gray-600 text-gray-200 hover:border-indigo-500 hover:bg-gray-700',
            ].join(' ')}
          >
            {String(card)}
          </button>
        );
      })}
    </div>
  );
}
