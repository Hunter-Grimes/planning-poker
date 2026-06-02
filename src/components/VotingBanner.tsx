interface Props {
  label: string;
}

// "Currently voting" banner naming the active component. Shown to host and guests
// alike during the voting phase.
export function VotingBanner({ label }: Props) {
  return (
    <div className="bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-3 mb-6">
      <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium uppercase tracking-wide mb-0.5">
        Currently voting
      </p>
      <p className="text-gray-900 dark:text-white font-semibold">{label}</p>
    </div>
  );
}
