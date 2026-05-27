import { useState } from 'react';
import { ThemeToggle } from './ThemeToggle';

interface Props {
  roomId: string;
  onJoin: (name: string) => void;
}

export function JoinScreen({ roomId, onJoin }: Props) {
  const [name, setName] = useState('');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🃏</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Join Room</h1>
          <p className="text-3xl font-bold font-mono tracking-[0.2em] text-indigo-600 dark:text-indigo-400 mt-2">{roomId}</p>
        </div>

        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Your name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && onJoin(name.trim())}
          placeholder="e.g. Bob"
          maxLength={64}
          className="w-full bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-4 py-3 border border-gray-300 dark:border-gray-700 focus:outline-none focus:border-indigo-500 mb-4"
          autoFocus
        />

        <button
          disabled={!name.trim()}
          onClick={() => onJoin(name.trim())}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg py-3 transition-colors"
        >
          Join Session
        </button>
      </div>
    </div>
  );
}
