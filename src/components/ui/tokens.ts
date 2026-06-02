// Single source of truth for the app's Tailwind class vocabulary.
//
// The components in this folder compose these fragments. One-off composite
// widgets that can't be a plain primitive (the segmented reveal control, the
// collapsible backlog heading, the inline rename field) import the same
// fragments directly, so nothing drifts out of sync.

/* ── Page background ─────────────────────────────────────────────────────── */
export const PAGE_BG = 'bg-gray-50 dark:bg-gray-950';

/* ── Surfaces ────────────────────────────────────────────────────────────── */
// Raised surface: modals, headers, the summary table.
export const CARD_SURFACE = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800';
// Inset surface: sub-sections nested inside a card or page.
export const PANEL_SURFACE =
  'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700';

/* ── Buttons ─────────────────────────────────────────────────────────────── */
export type ButtonVariant = 'primary' | 'success' | 'secondary' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500',
  success:
    'bg-emerald-700 hover:bg-emerald-600 text-white disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500',
  secondary:
    'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600',
  danger: 'bg-red-700 dark:bg-red-800 hover:bg-red-600 dark:hover:bg-red-700 text-white',
};

export const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'text-xs px-3 py-1 rounded-lg',
  md: 'text-sm px-4 py-2 rounded-lg',
  lg: 'py-3 px-5 rounded-xl',
};

/* ── Pill buttons (rounded chips in the room header) ─────────────────────── */
export type PillVariant = 'neutral' | 'subtle' | 'success' | 'dangerHover';

export const PILL_BASE =
  'inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-colors';

export const PILL_VARIANTS: Record<PillVariant, string> = {
  neutral:
    'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700',
  subtle:
    'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border-gray-300 dark:border-gray-700',
  success:
    'bg-emerald-100 dark:bg-emerald-950 border-emerald-400 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300',
  dangerHover:
    'bg-gray-100 dark:bg-gray-800 hover:bg-red-100 dark:hover:bg-red-950 text-gray-500 dark:text-gray-400 hover:text-red-700 dark:hover:text-red-300 border-gray-300 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-800',
};

/* ── Inputs ──────────────────────────────────────────────────────────────── */
export type InputVariant = 'default' | 'code' | 'compact' | 'inline';

export const INPUT_VARIANTS: Record<InputVariant, string> = {
  // Full-size text field (name entry).
  default:
    'w-full bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-4 py-3 border border-gray-300 dark:border-gray-700 focus:outline-none focus:border-indigo-500 placeholder-gray-400 dark:placeholder-gray-600',
  // Room-code entry: monospace, centred, upper-cased.
  code: 'w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-lg px-4 py-2.5 border border-gray-300 dark:border-gray-600 focus:outline-none focus:border-emerald-500 font-mono tracking-widest text-center uppercase placeholder-gray-400 dark:placeholder-gray-600 placeholder:tracking-normal placeholder:font-sans',
  // Inline "add" field that shares a row with a button. Stays at 16px on mobile
  // (text-base) so focusing it doesn't trigger iOS Safari's auto-zoom; drops to
  // the denser text-sm from `sm:` up.
  compact:
    'flex-1 bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-base sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-gray-500',
  // Seamless underline editor (rename in place).
  inline:
    'flex-1 min-w-0 bg-transparent border-b border-indigo-400 dark:border-indigo-500 text-gray-900 dark:text-white outline-none px-0.5',
};

/* ── Headings ────────────────────────────────────────────────────────────── */
export type HeadingTone = 'default' | 'warning';

export const HEADING_BASE = 'text-sm font-semibold uppercase tracking-wide';

export const HEADING_TONES: Record<HeadingTone, string> = {
  default: 'text-gray-500 dark:text-gray-400',
  warning: 'text-yellow-700 dark:text-yellow-400',
};
