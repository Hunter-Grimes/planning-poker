import { CardValue, FIBONACCI_CARDS } from './types';

export interface CardColorSet {
  idle: string;
  hover: string;
  selected: string;
  chip: string;
  soft: string; // pastel-ish background for revealed-vote summary cards
}

// Cool → warm: violet → indigo → blue → teal → lime → amber → orange → red, slate for ?
// prettier-ignore — the columns are hand-aligned for readability across rows.
export const CARD_COLORS: CardColorSet[] = [
  {
    idle: 'bg-violet-900 border-violet-700 text-violet-200',
    hover: 'hover:bg-violet-800 hover:border-violet-500',
    selected: 'bg-violet-600 border-violet-400 text-white shadow-lg shadow-violet-950',
    chip: 'bg-violet-600 border-violet-400',
    soft: 'bg-violet-200 dark:bg-violet-950 text-violet-900 dark:text-violet-200',
  },
  {
    idle: 'bg-indigo-900 border-indigo-700 text-indigo-200',
    hover: 'hover:bg-indigo-800 hover:border-indigo-500',
    selected: 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-950',
    chip: 'bg-indigo-600 border-indigo-400',
    soft: 'bg-indigo-200 dark:bg-indigo-950 text-indigo-900 dark:text-indigo-200',
  },
  {
    idle: 'bg-blue-900 border-blue-700 text-blue-200',
    hover: 'hover:bg-blue-800 hover:border-blue-500',
    selected: 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-950',
    chip: 'bg-blue-600 border-blue-400',
    soft: 'bg-blue-200 dark:bg-blue-950 text-blue-900 dark:text-blue-200',
  },
  {
    idle: 'bg-teal-900 border-teal-700 text-teal-200',
    hover: 'hover:bg-teal-800 hover:border-teal-500',
    selected: 'bg-teal-600 border-teal-400 text-white shadow-lg shadow-teal-950',
    chip: 'bg-teal-600 border-teal-400',
    soft: 'bg-teal-200 dark:bg-teal-950 text-teal-900 dark:text-teal-200',
  },
  {
    idle: 'bg-lime-900 border-lime-700 text-lime-200',
    hover: 'hover:bg-lime-800 hover:border-lime-500',
    selected: 'bg-lime-600 border-lime-400 text-white shadow-lg shadow-lime-950',
    chip: 'bg-lime-600 border-lime-400',
    soft: 'bg-lime-200 dark:bg-lime-950 text-lime-900 dark:text-lime-200',
  },
  {
    idle: 'bg-amber-900 border-amber-700 text-amber-200',
    hover: 'hover:bg-amber-800 hover:border-amber-500',
    selected: 'bg-amber-600 border-amber-400 text-white shadow-lg shadow-amber-950',
    chip: 'bg-amber-600 border-amber-400',
    soft: 'bg-amber-200 dark:bg-amber-950 text-amber-900 dark:text-amber-200',
  },
  {
    idle: 'bg-orange-900 border-orange-700 text-orange-200',
    hover: 'hover:bg-orange-800 hover:border-orange-500',
    selected: 'bg-orange-600 border-orange-400 text-white shadow-lg shadow-orange-950',
    chip: 'bg-orange-600 border-orange-400',
    soft: 'bg-orange-200 dark:bg-orange-950 text-orange-900 dark:text-orange-200',
  },
  {
    idle: 'bg-red-900 border-red-700 text-red-200',
    hover: 'hover:bg-red-800 hover:border-red-500',
    selected: 'bg-red-600 border-red-400 text-white shadow-lg shadow-red-950',
    chip: 'bg-red-600 border-red-400',
    soft: 'bg-red-200 dark:bg-red-950 text-red-900 dark:text-red-200',
  },
  {
    idle: 'bg-slate-800 border-slate-600 text-slate-300',
    hover: 'hover:bg-slate-700 hover:border-slate-400',
    selected: 'bg-slate-500 border-slate-300 text-white shadow-lg shadow-slate-950',
    chip: 'bg-slate-500 border-slate-300',
    soft: 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-200',
  },
];

const valueToIndex = new Map<CardValue, number>(FIBONACCI_CARDS.map((v, i) => [v, i]));

export function getCardColors(value: CardValue): CardColorSet {
  return CARD_COLORS[valueToIndex.get(value) ?? CARD_COLORS.length - 1];
}
