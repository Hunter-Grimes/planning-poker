import { useTheme } from '../hooks/useTheme';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { preference, cycle } = useTheme();

  const label = preference === 'system' ? 'System' : preference === 'light' ? 'Light' : 'Dark';
  const title = `Theme: ${label} (click to change)`;

  const icon =
    preference === 'system' ? (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
    ) : preference === 'light' ? (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    ) : (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );

  return (
    <button
      onClick={cycle}
      title={title}
      aria-label={title}
      className={[
        'inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-colors',
        'bg-gray-100 hover:bg-gray-200 border-gray-300 text-gray-600',
        'dark:bg-gray-800 dark:hover:bg-gray-700 dark:border-gray-700 dark:text-gray-400',
        className,
      ].join(' ')}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
