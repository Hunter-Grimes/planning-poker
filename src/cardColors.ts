import { CardValue, FIBONACCI_CARDS } from './types';

export interface CardColorSet {
  idle: string;
  hover: string;
  selected: string;
  chip: string;
  soft: string; // pastel-ish background for revealed-vote summary cards
}

// Cool → warm: violet → indigo → blue → teal → lime → amber → orange → red, slate for ?
//
// Each state carries both schemes: light mode uses soft, pale cards with dark
// ink (bg-*-100 / text-*-700); dark mode keeps the deep, saturated cards
// (dark:bg-*-900 / dark:text-*-200). The `selected` state stays vibrant in both
// (a bold *-600 card with white text), only its glow shifts to suit the page.
export const CARD_COLORS: CardColorSet[] = [
  {
    idle: 'bg-violet-100 border-violet-300 text-violet-700 dark:bg-violet-900 dark:border-violet-700 dark:text-violet-200',
    hover:
      'hover:bg-violet-200 hover:border-violet-400 dark:hover:bg-violet-800 dark:hover:border-violet-500',
    selected:
      'bg-violet-600 border-violet-400 text-white shadow-lg shadow-violet-300 dark:shadow-violet-950',
    chip: 'bg-violet-600 border-violet-400',
    soft: 'bg-violet-200 dark:bg-violet-950 text-violet-900 dark:text-violet-200',
  },
  {
    idle: 'bg-indigo-100 border-indigo-300 text-indigo-700 dark:bg-indigo-900 dark:border-indigo-700 dark:text-indigo-200',
    hover:
      'hover:bg-indigo-200 hover:border-indigo-400 dark:hover:bg-indigo-800 dark:hover:border-indigo-500',
    selected:
      'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-300 dark:shadow-indigo-950',
    chip: 'bg-indigo-600 border-indigo-400',
    soft: 'bg-indigo-200 dark:bg-indigo-950 text-indigo-900 dark:text-indigo-200',
  },
  {
    idle: 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900 dark:border-blue-700 dark:text-blue-200',
    hover:
      'hover:bg-blue-200 hover:border-blue-400 dark:hover:bg-blue-800 dark:hover:border-blue-500',
    selected:
      'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-300 dark:shadow-blue-950',
    chip: 'bg-blue-600 border-blue-400',
    soft: 'bg-blue-200 dark:bg-blue-950 text-blue-900 dark:text-blue-200',
  },
  {
    idle: 'bg-teal-100 border-teal-300 text-teal-700 dark:bg-teal-900 dark:border-teal-700 dark:text-teal-200',
    hover:
      'hover:bg-teal-200 hover:border-teal-400 dark:hover:bg-teal-800 dark:hover:border-teal-500',
    selected:
      'bg-teal-600 border-teal-400 text-white shadow-lg shadow-teal-300 dark:shadow-teal-950',
    chip: 'bg-teal-600 border-teal-400',
    soft: 'bg-teal-200 dark:bg-teal-950 text-teal-900 dark:text-teal-200',
  },
  {
    idle: 'bg-lime-100 border-lime-300 text-lime-700 dark:bg-lime-900 dark:border-lime-700 dark:text-lime-200',
    hover:
      'hover:bg-lime-200 hover:border-lime-400 dark:hover:bg-lime-800 dark:hover:border-lime-500',
    selected:
      'bg-lime-600 border-lime-400 text-white shadow-lg shadow-lime-300 dark:shadow-lime-950',
    chip: 'bg-lime-600 border-lime-400',
    soft: 'bg-lime-200 dark:bg-lime-950 text-lime-900 dark:text-lime-200',
  },
  {
    idle: 'bg-amber-100 border-amber-300 text-amber-700 dark:bg-amber-900 dark:border-amber-700 dark:text-amber-200',
    hover:
      'hover:bg-amber-200 hover:border-amber-400 dark:hover:bg-amber-800 dark:hover:border-amber-500',
    selected:
      'bg-amber-600 border-amber-400 text-white shadow-lg shadow-amber-300 dark:shadow-amber-950',
    chip: 'bg-amber-600 border-amber-400',
    soft: 'bg-amber-200 dark:bg-amber-950 text-amber-900 dark:text-amber-200',
  },
  {
    idle: 'bg-orange-100 border-orange-300 text-orange-700 dark:bg-orange-900 dark:border-orange-700 dark:text-orange-200',
    hover:
      'hover:bg-orange-200 hover:border-orange-400 dark:hover:bg-orange-800 dark:hover:border-orange-500',
    selected:
      'bg-orange-600 border-orange-400 text-white shadow-lg shadow-orange-300 dark:shadow-orange-950',
    chip: 'bg-orange-600 border-orange-400',
    soft: 'bg-orange-200 dark:bg-orange-950 text-orange-900 dark:text-orange-200',
  },
  {
    idle: 'bg-red-100 border-red-300 text-red-700 dark:bg-red-900 dark:border-red-700 dark:text-red-200',
    hover: 'hover:bg-red-200 hover:border-red-400 dark:hover:bg-red-800 dark:hover:border-red-500',
    selected: 'bg-red-600 border-red-400 text-white shadow-lg shadow-red-300 dark:shadow-red-950',
    chip: 'bg-red-600 border-red-400',
    soft: 'bg-red-200 dark:bg-red-950 text-red-900 dark:text-red-200',
  },
  {
    idle: 'bg-slate-100 border-slate-300 text-slate-600 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300',
    hover:
      'hover:bg-slate-200 hover:border-slate-400 dark:hover:bg-slate-700 dark:hover:border-slate-400',
    selected:
      'bg-slate-500 border-slate-300 text-white shadow-lg shadow-slate-300 dark:shadow-slate-950',
    chip: 'bg-slate-500 border-slate-300',
    soft: 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-200',
  },
];

const valueToIndex = new Map<CardValue, number>(FIBONACCI_CARDS.map((v, i) => [v, i]));

export function getCardColors(value: CardValue): CardColorSet {
  return CARD_COLORS[valueToIndex.get(value) ?? CARD_COLORS.length - 1];
}
