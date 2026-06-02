import { useState } from 'react';
import { ThemeToggle } from './ThemeToggle';
import { MAX_NAME_LENGTH } from '../types';

interface Props {
  onCreateRoom: (name: string) => void;
  onJoinRoom: (code: string, name: string) => void;
}

export function HomeScreen({ onCreateRoom, onJoinRoom }: Props) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const canCreate = name.trim().length > 0;
  const canJoin = canCreate && code.trim().length === 6;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🃏</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Planning Poker</h1>
        </div>

        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Your name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME_LENGTH}
          placeholder="Enter your name"
          className="w-full bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-4 py-3 border border-gray-300 dark:border-gray-700 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500 placeholder-gray-400 dark:placeholder-gray-600"
          autoFocus
        />

        <div className="mt-6 flex flex-col gap-3">
          <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-500 uppercase tracking-wide font-medium mb-3">
              Create a new room
            </p>
            <button
              disabled={!canCreate}
              onClick={() => onCreateRoom(name.trim())}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg py-2.5 transition-colors"
            >
              Create Room
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-gray-300 dark:border-gray-700" />
            <span className="text-xs text-gray-500 dark:text-gray-600 uppercase tracking-wide">or</span>
            <div className="flex-1 border-t border-gray-300 dark:border-gray-700" />
          </div>

          <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-500 uppercase tracking-wide font-medium mb-3">
              Join an existing room
            </p>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && canJoin && onJoinRoom(code.trim(), name.trim())}
              maxLength={6}
              placeholder="Room code"
              className="w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-lg px-4 py-2.5 border border-gray-300 dark:border-gray-600 focus:outline-none focus:border-emerald-500 mb-3 font-mono tracking-widest text-center uppercase placeholder-gray-400 dark:placeholder-gray-600 placeholder:tracking-normal placeholder:font-sans"
            />
            <button
              disabled={!canJoin}
              onClick={() => onJoinRoom(code.trim(), name.trim())}
              className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg py-2.5 transition-colors"
            >
              Join Session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
